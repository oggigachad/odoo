# 08 — Error Handling

## 1. Principles
1. Every error has a **stable machine code**, a **human message** a student can act on, and a `request_id`.
2. The client decides what to show from the **code**, never by parsing the message.
3. Never leak internals: no stack traces, SQL, table names, or secrets in responses.
4. Fail safe for money: if unsure whether a payment succeeded, do nothing automatic and alert.
5. One error shape everywhere (`06_API_CONTRACT.md` §3).

## 2. Error catalogue
| Code | HTTP | When | Message shown to the user |
|---|---|---|---|
| `VALIDATION_ERROR` | 422 | Bad or missing field | "Please check the highlighted fields." |
| `UNAUTHENTICATED` | 401 | Missing, expired, or invalid session | "Please sign in again." |
| `FORBIDDEN` | 403 | Role not allowed | "You don't have access to this." |
| `NOT_FOUND` | 404 | Unknown resource | "We couldn't find that." |
| `DUPLICATE_EMAIL` | 409 | Email already registered | "This email is already registered. Try signing in." |
| `SOLD_OUT` | 409 | No seats left | "Sorry, this event is sold out." |
| `INSUFFICIENT_STOCK` | 409 | Size out of stock | "That size is no longer available in this quantity." |
| `TICKET_NOT_FOUND` | 404 | Unknown ticket code | "Ticket not found." |
| `TICKET_ALREADY_CHECKED_IN` | 409 | Second scan | "Already checked in at {time}." |
| `TICKET_UNPAID` | 409 | Reserved but not paid | "This ticket has not been paid for." |
| `TICKET_WRONG_EVENT` | 409 | Ticket for another event | "This ticket is for a different event." |
| `ORDER_NOT_PAYABLE` | 409 | Order cancelled, expired, or already paid | "This order can no longer be paid. Please place it again." |
| `RESERVATION_EXPIRED` | 409 | Tickets released before payment | "Your hold expired. Please try again." |
| `PAYMENT_FAILED` | 402 | Gateway reports failure | "Payment didn't go through. You have not been charged." |
| `PAYMENT_SIGNATURE_INVALID` | 400 | Webhook signature mismatch | (not user-facing) |
| `INVALID_STATE_TRANSITION` | 409 | e.g. reimburse a rejected expense | "That action isn't possible in the current status." |
| `SELF_APPROVAL_NOT_ALLOWED` | 403 | Treasurer acts on own expense | "Another officer needs to review your own expense." |
| `IDEMPOTENCY_CONFLICT` | 409 | Same key, different body | "Duplicate request detected." |
| `RATE_LIMITED` | 429 | Too many requests | "Too many attempts. Try again in a minute." |
| `SERVICE_UNAVAILABLE` | 503 | Database or dependency down | "Something is wrong on our side. Please try again shortly." |
| `INTERNAL_ERROR` | 500 | Unhandled exception | "Something went wrong. Reference: {request_id}." |

## 3. Mapping lower-level errors
| Source | Becomes |
|---|---|
| Pydantic validation | `VALIDATION_ERROR` with `details.fields` |
| Unique violation on `members_email_uq` | `DUPLICATE_EMAIL` |
| Trigger `enforce_seat_limit` (SQLSTATE `P0001`, message starts `Sold out`) | `SOLD_OUT` |
| Check violation (negative stock, etc.) | `VALIDATION_ERROR` or `INSUFFICIENT_STOCK`, depending on the service |
| Foreign key violation | `NOT_FOUND` or `VALIDATION_ERROR` for the referenced field |
| Deadlock or serialization failure | Retry the transaction up to 3 times, then `SERVICE_UNAVAILABLE` |
| Any other database error | `INTERNAL_ERROR`, full detail only in logs |

The service checks seats and stock itself first; the database trigger and constraints are a backstop, not the main path.

## 4. Payments
- **Payment succeeded but reservation expired:** webhook returns `200`, logs `late_payment` with order and ticket references, raises an alert, and the treasurer refunds via the gateway dashboard.
- **User closes the payment page:** nothing to undo; the reservation expires by itself.
- **Webhook arrives twice:** second is a no-op (`02_TRD.md` §3.7).
- **Gateway timeout while creating the order:** roll back the reservation transaction and return `SERVICE_UNAVAILABLE`.

## 5. Email
Retry 3 times with exponential backoff (1 min, 5 min, 30 min). After the last failure log `email_failed` with the message type. Announcements, tickets and magic links stay valid even if an email never arrives: the announcement is on the site, the ticket is under "My tickets", and the user can request a new magic link.

## 6. Client behaviour
| Situation | Web / mobile does |
|---|---|
| `401` | Clear the session, go to sign-in, return to the same page afterwards |
| `403` | Show a "no access" page |
| `404` | Show a friendly not-found page |
| `409` / `422` | Show the message inline next to the action; keep the user's input |
| `429` | Disable the button and show the wait time |
| `5xx` / network error | Show "Try again", keep input, retry button, never auto-retry payments |
| Door check-in | Full-screen result: **green** admitted, **amber** already used (with time), **red** invalid, unpaid or wrong event. Icon and text, never colour alone |

## 7. Logging and monitoring
- Log every `5xx` with `request_id`, route, user ID (not email), and exception class to Sentry.
- Log `late_payment`, `email_failed`, `webhook_signature_invalid` as structured events.
- Alert on: any `late_payment`, ≥ 5 `5xx` in 5 minutes, failed job run, `/ready` failing for 2 minutes.
- Never log tokens, magic-link URLs, payment secrets, or full request bodies.

## 8. Jobs
Each job is idempotent and logs `started`, `processed N`, `finished`. A crash mid-run is safe to re-run. A failed run alerts.
