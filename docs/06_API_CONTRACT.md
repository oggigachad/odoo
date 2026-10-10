# 06 — API Contract

REST + JSON. This file is the contract: the backend must match it, the web and mobile clients may rely on it. FastAPI's generated `/openapi.json` is checked against it in CI. A breaking change needs a new version prefix (`/api/v2`).

## 1. Conventions
| Topic | Rule |
|---|---|
| Base URL | `/api/v1` |
| Format | JSON, `snake_case` |
| Auth | `Authorization: Bearer <token>` (mobile) or session cookie (web, `HttpOnly`, sent with `credentials: "include"`). See `09_SECURITY.md` |
| Caching | Only four reports are cached (`ticket_availability`, `active_members`, `club_balance`, `fundraiser_progress`) and may be up to 30 to 60 s old (`02_TRD.md` §3.11). Writes, purchases, orders and check-in always use live data from PostgreSQL |
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
| `GET /ready` | Public | Readiness: fails only when the database is unreachable. The body also reports `redis: "up"` or `"down"`; Redis down does not fail readiness |
| `GET /config` | Public | `{"ads_enabled": true}` kill switch for the mobile app |

### 2.2 Auth and profile
| Method & path | Access | Purpose |
|---|---|---|
| `POST /auth/magic-link` `{email, portal}` | Public | Always `202`, even for unknown emails. `portal` is `member` (default), `officer` or `treasurer`: it only picks which login page the link returns to and never grants access. Redis down ⇒ `503 SERVICE_UNAVAILABLE` |
| `POST /auth/token` `{token}` | Public | Exchange a magic-link token for a session. A link works once; expired, used or tampered ⇒ `401 UNAUTHENTICATED` with `details.reason` of `expired`, `used` or `invalid` |
| `POST /auth/logout` | Member | Clear the session cookie. The session is stateless, so a copied cookie stays valid until its 24 h expiry (emergency: rotate `JWT_SECRET`) |
| `GET /me` | Member | Profile, `roles` (every role held: `member`, `officer`, `treasurer`), membership status |

### 2.3 Members, memberships, leadership (MEM)
| Method & path | Access | Purpose |
|---|---|---|
| `POST /members` | Public (rate-limited) | Self sign-up; officers can also create |
| `GET /members?q=&active=` | Officer | Search members |
| `GET /members/{id}` | Self / Officer | Read |
| `PATCH /members/{id}` | Self / Officer | Update name, phone |
| `GET /members/lookup?q=` | Officer | Quick verification: returns `is_active`, `semester`, `membership_type`, `valid_until` (the semester end date) (MEM-4) |
| `GET /members/{id}/memberships` | Self / Officer | History, one row per semester |
| `GET /semesters`, `GET /membership-types` | Public | Semesters, and the membership types on sale with their dues (`is_offered` only) |
| `POST /semesters`, `PATCH /semesters/{id}` | Officer | Define a semester (name, start, end). Overlap ⇒ `409 SEMESTER_OVERLAP` |
| `POST /membership-types`, `PATCH /membership-types/{id}` | Officer | Define a type (name, dues per semester, `is_offered`) |
| `POST /memberships` `{member_id, semester_id, membership_type_id}` | Member (own) / Officer | Create unpaid membership; `dues_amount` is copied from the type. Second one for the same semester ⇒ `409 MEMBERSHIP_EXISTS` |
| `GET /memberships/expiring?days=30` | Officer | Due for renewal (paid, semester ending, no later paid semester) |
| `POST /memberships/{id}/payments` `{method}` | Member (own, online) / Officer (cash or online) | Pay dues |
| `GET /leadership?term_year=` | Officer | List roles |
| `POST /leadership` `{member_id, position, term_year}` | Officer | Add |
| `DELETE /leadership/{id}` | Officer | Remove |

### 2.4 Events and tickets (TIX)
| Method & path | Access | Purpose |
|---|---|---|
| `GET /events?upcoming=true` | Public | List |
| `GET /events/{id}` | Public | Detail with ticket types, `seats_left` and `non_member_seats_left` |
| `POST /events`, `PATCH /events/{id}` | Officer | Manage |
| `POST /events/{id}/ticket-types`, `PATCH /ticket-types/{id}` | Officer | Prices, `seat_limit` and `non_member_seat_limit` (0 to `seat_limit`) |
| `POST /tickets/purchase` | Public | Reserve and start payment, for members and non-members (§4.1) |
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
| `GET /products` | Public | Products with variants, stock, both prices, `non_member_units_left` |
| `POST /products`, `PATCH /products/{id}` | Officer | Manage, including `non_member_limit` (0 = members only) |
| `POST /products/{id}/variants`, `PATCH /variants/{id}` | Officer | Sizes and stock |
| `POST /orders` `{items:[{variant_id, quantity}]}` plus `buyer_name`, `buyer_email` when not signed in or not an active member | Public | Reserve stock, status `placed`. Non-members are served first come, first served within `non_member_limit` (§4.5) |
| `POST /orders/{id}/payments` `{method}` | Member (own, online) / Officer | Pay. Non-members receive the payment details in the `POST /orders` response and have no separate call |
| `POST /orders/{id}/cancel` | Member (own, unpaid) / Officer | Cancel, restore stock and give non-member units back. Non-member orders that are not paid expire after 15 minutes |
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
Errors: `SOLD_OUT` (no seats left at all), `SOLD_OUT_NON_MEMBER` (the non-member seats are gone, even if members' seats remain), `VALIDATION_ERROR`, `NOT_FOUND`, `RATE_LIMITED`.
A purchase with several holders is all or nothing: if one holder cannot get a seat, none are reserved.

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
{"member_id": 31, "full_name": "Aisha Khan", "is_active": true,
 "semester": "Fall 2026", "membership_type": "[type name]", "valid_until": "[semester end date]"}
```
`valid_until` is the end date of the semester the member paid for. The type name and dates are whatever the club has defined.

### 4.5 `POST /orders` (non-member)
Request (prices are **not** sent by the client):
```json
{
  "buyer_name": "Ravi Patel",
  "buyer_email": "ravi@example.com",
  "items": [{"variant_id": 14, "quantity": 2}]
}
```
`201` response: the order with `status: "placed"`, `reserved_until`, `unit_price` at the non-member price, and `payment` (gateway order) as in §4.1.
Errors: `NON_MEMBER_LIMIT_REACHED` (the product's non-member units are used up; `details` has `units_left`), `INSUFFICIENT_STOCK`, `VALIDATION_ERROR`, `RATE_LIMITED`.
If the buyer's email belongs to an active member, the order is priced and recorded as a member order instead.

## 5. Webhook contract
- `POST /webhooks/payment` with the gateway's signature header.
- Invalid signature ⇒ `400 PAYMENT_SIGNATURE_INVALID`, nothing processed.
- Valid and already processed ⇒ `200` (so the gateway stops retrying).
- Valid and unknown target ⇒ `200`, logged, alert raised (refund runbook).
- Valid, ticket hold already released ⇒ the seat is checked again in the database in one locked step. Still free ⇒ the ticket is marked paid. Gone ⇒ the buyer is refunded and told, `200` to the gateway, `late_payment` logged (`02_TRD.md` §3.7).

## 6. Rate limits
| Endpoint group | Limit | Counted in |
|---|---|---|
| `POST /auth/magic-link` (sign-in email links) | 5 / minute per IP | Redis |
| `POST /tickets/purchase`, `POST /orders` | 10 / minute per IP | Redis |
| `POST /members` | 10 / hour per IP | Not Redis |
| `POST /checkin` | 60 / minute per user | Not Redis |
| Everything else | 120 / minute per IP | Not Redis |

Exceeded ⇒ `429 RATE_LIMITED` with `Retry-After`. The three Redis-backed limits (`rate:{endpoint}:{ip}`, 1 min, `D-028`) are sign-in email links, ticket purchase and shop orders; if Redis is unreachable they are skipped and logged. The other limits are not stored in Redis (the host's reverse proxy applies them).
