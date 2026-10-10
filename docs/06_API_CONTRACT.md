# 06 — API Contract

REST + JSON. This file is the contract: the backend must match it, the web and mobile clients may rely on it. FastAPI's generated `/openapi.json` is checked against it in CI. A breaking change needs a new version prefix (`/api/v2`).

## 1. Conventions
| Topic | Rule |
|---|---|
| Base URL | `/api/v1` |
| Format | JSON, `snake_case` |
| Auth | `Authorization: Bearer <token>` (mobile) or session cookie (web). See `09_SECURITY.md` |
| Money | String with two decimals: `"500.00"`. Currency is always INR |
| Time | ISO 8601 UTC: `"2026-11-14T13:30:00Z"` |
| IDs | Integers, except `ticket_code` (UUID) |
| Pagination | `?limit=20&offset=0` (limit ≤ 100). Response: `{"items": [...], "total": 123, "limit": 20, "offset": 0}` |
| Idempotency | `Idempotency-Key: <uuid>` required on purchase, order and payment-creating POSTs. Same key + same body returns the original result; same key + different body ⇒ `409 IDEMPOTENCY_CONFLICT` |
| Request ID | Every response has `X-Request-ID` |
| Errors | Always the shape in §3, codes in `08_ERROR_HANDLING.md` |

Access legend: **Public**, **Member**, **Officer**, **Treasurer**, **Webhook**.

## 2. Endpoints

### 2.1 System
| Method & path | Access | Purpose |
|---|---|---|
| `GET /health` | Public | Liveness |
| `GET /ready` | Public | Readiness (database reachable) |
| `GET /config` | Public | `{"ads_enabled": true}` kill switch for the mobile app |

### 2.2 Auth and profile
| Method & path | Access | Purpose |
|---|---|---|
| `POST /auth/magic-link` `{email}` | Public | Always `202`, even for unknown emails |
| `POST /auth/token` `{token}` | Public | Exchange magic-link token for a session |
| `GET /me` | Member | Profile, roles, membership status |

### 2.3 Members, memberships, leadership (MEM)
| Method & path | Access | Purpose |
|---|---|---|
| `POST /members` | Public (rate-limited) | Self sign-up; officers can also create |
| `GET /members?q=&active=` | Officer | Search members |
| `GET /members/{id}` | Self / Officer | Read |
| `PATCH /members/{id}` | Self / Officer | Update name, phone |
| `GET /members/lookup?q=` | Officer | Quick verification: returns `is_active`, `valid_until` (MEM-4) |
| `GET /members/{id}/memberships` | Self / Officer | History |
| `POST /memberships` `{member_id, valid_from, valid_until, dues_amount}` | Officer | Create unpaid membership |
| `GET /memberships/expiring?days=30` | Officer | Due for renewal |
| `POST /memberships/{id}/payments` `{method}` | Member (own, online) / Officer (cash or online) | Pay dues |
| `GET /leadership?term_year=` | Officer | List roles |
| `POST /leadership` `{member_id, position, term_year}` | Officer | Add |
| `DELETE /leadership/{id}` | Officer | Remove |

### 2.4 Events and tickets (TIX)
| Method & path | Access | Purpose |
|---|---|---|
| `GET /events?upcoming=true` | Public | List |
| `GET /events/{id}` | Public | Detail with ticket types and `seats_left` |
| `POST /events`, `PATCH /events/{id}` | Officer | Manage |
| `POST /events/{id}/ticket-types`, `PATCH /ticket-types/{id}` | Officer | Prices and seat limit |
| `POST /tickets/purchase` | Public | Reserve and start payment (§4.1) |
| `GET /tickets/{ticket_code}` | Public (code is the secret) | Ticket page and QR data |
| `GET /me/tickets` | Member | My tickets |
| `GET /events/{id}/tickets?checked_in=` | Officer | Attendee list |
| `POST /checkin` `{event_id, ticket_code}` | Officer | Door check-in (§4.2) |
| `GET /events/{id}/summary` | Officer | Sold, attended, revenue |

### 2.5 Announcements (ANN)
| Method & path | Access | Purpose |
|---|---|---|
| `GET /announcements` | Public | Newest first |
| `GET /announcements/{id}` | Public | One |
| `POST /announcements` `{title, body}` | Officer | Post and queue emails; returns `emails_queued` |

### 2.6 Merchandise (MER)
| Method & path | Access | Purpose |
|---|---|---|
| `GET /products` | Public | Products with variants, stock, both prices |
| `POST /products`, `PATCH /products/{id}` | Officer | Manage |
| `POST /products/{id}/variants`, `PATCH /variants/{id}` | Officer | Sizes and stock |
| `POST /orders` `{items:[{variant_id, quantity}]}` | Member | Reserve stock, status `placed` |
| `POST /orders/{id}/payments` `{method}` | Member (own, online) / Officer | Pay |
| `POST /orders/{id}/cancel` | Member (own, unpaid) / Officer | Cancel and restore stock |
| `GET /me/orders`, `GET /orders?status=`, `GET /orders/{id}` | Member / Officer | Read |

### 2.7 Fundraisers (FUN)
| Method & path | Access | Purpose |
|---|---|---|
| `GET /fundraisers`, `GET /fundraisers/{id}` | Member | List; detail with progress |
| `POST /fundraisers`, `PATCH /fundraisers/{id}` | Officer | Manage |
| `GET /fundraisers/{id}/tasks`, `POST /fundraisers/{id}/tasks` | Member / Officer | List; create |
| `PATCH /tasks/{id}` | Assignee (status only) / Officer | Update |
| `POST /fundraisers/{id}/payments` `{amount, method}` | Officer | Record money raised |

### 2.8 Expenses and treasurer (TRS)
| Method & path | Access | Purpose |
|---|---|---|
| `POST /expenses/receipt-upload-url` `{content_type, size}` | Member | Signed upload URL |
| `POST /expenses` | Member | Submit |
| `GET /me/expenses`, `GET /expenses?status=` | Member / Officer | Read |
| `POST /expenses/{id}/approve`, `/reject`, `/reimburse` | Treasurer | Workflow (not on own expense) |
| `GET /treasurer/summary` | Officer | In, out, balance |
| `GET /treasurer/ledger?from=&to=&category=` | Officer | Itemised movements |
| `GET /treasurer/outstanding` | Officer | Who still owes what |

### 2.9 Webhook
| Method & path | Access | Purpose |
|---|---|---|
| `POST /webhooks/payment` | Webhook (signature) | Gateway payment result |

## 3. Error shape
```json
{
  "error": {
    "code": "SOLD_OUT",
    "message": "No seats left for this ticket type.",
    "details": {"ticket_type_id": 7},
    "request_id": "7c1f0a52-..."
  }
}
```
Validation errors (`422 VALIDATION_ERROR`) put `details.fields` as `[{"field": "email", "message": "..."}]`.

## 4. Key examples

### 4.1 `POST /tickets/purchase`
Request (price is **not** sent by the client):
```json
{
  "ticket_type_id": 7,
  "buyer_email": "aisha@example.com",
  "tickets": [
    {"holder_name": "Aisha Khan", "holder_email": "aisha@example.com"},
    {"holder_name": "Ravi Patel", "holder_email": "ravi@example.com"}
  ]
}
```
`201` response:
```json
{
  "tickets": [
    {"ticket_id": 501, "ticket_code": "3f9c8a64-2c1d-4a8b-9f0e-6a1b7e2d4c10",
     "holder_name": "Aisha Khan", "price_paid": "300.00", "is_member_price": true,
     "status": "reserved", "reserved_until": "2026-11-14T13:45:00Z"},
    {"ticket_id": 502, "ticket_code": "b1d2c3e4-0f11-4c22-8a33-9d44e5f60718",
     "holder_name": "Ravi Patel", "price_paid": "500.00", "is_member_price": false,
     "status": "reserved", "reserved_until": "2026-11-14T13:45:00Z"}
  ],
  "payment": {"gateway_order_id": "order_abc123", "amount": "800.00", "currency": "INR"}
}
```
If the total is `"0.00"`, tickets come back `"status": "valid"` and `payment` is `null`.
Errors: `SOLD_OUT`, `VALIDATION_ERROR`, `NOT_FOUND`, `RATE_LIMITED`.

### 4.2 `POST /checkin`
Request: `{"event_id": 12, "ticket_code": "3f9c8a64-..."}`
`200`:
```json
{"result": "admitted", "ticket_id": 501, "holder_name": "Aisha Khan",
 "is_member": true, "checked_in_at": "2026-11-14T18:02:11Z"}
```
Failures: `409 TICKET_ALREADY_CHECKED_IN` (details has `checked_in_at`), `409 TICKET_UNPAID`, `409 TICKET_WRONG_EVENT`, `404 TICKET_NOT_FOUND`.

### 4.3 `GET /treasurer/summary`
```json
{
  "money_in": [
    {"category": "dues", "total": "12000.00"},
    {"category": "ticket", "total": "48000.00"},
    {"category": "merchandise", "total": "21500.00"},
    {"category": "fundraiser", "total": "6400.00"}
  ],
  "total_in": "87900.00",
  "money_out_reimbursed": "15300.00",
  "balance": "72600.00"
}
```

### 4.4 `GET /members/lookup?q=aisha@example.com`
```json
{"member_id": 31, "full_name": "Aisha Khan", "is_active": true, "valid_until": "2026-12-31"}
```

## 5. Webhook contract
- `POST /webhooks/payment` with the gateway's signature header.
- Invalid signature ⇒ `400 PAYMENT_SIGNATURE_INVALID`, nothing processed.
- Valid and already processed ⇒ `200` (so the gateway stops retrying).
- Valid and unknown or expired target ⇒ `200`, logged, alert raised (refund runbook).

## 6. Rate limits
| Endpoint group | Limit |
|---|---|
| `POST /auth/magic-link` | 5 / hour per email, 20 / hour per IP |
| `POST /members` | 10 / hour per IP |
| `POST /tickets/purchase`, `POST /orders` | 10 / minute per IP |
| `POST /checkin` | 60 / minute per user |
| Everything else | 120 / minute per IP |

Exceeded ⇒ `429 RATE_LIMITED` with `Retry-After`.
