# 01 — Product Requirements Document (PRD)

**Product:** Oddoskyline, a student organization system for the Skyline Student Association
**Brief:** one unified platform to run events, members and money in one place.

## 1. Problem
Today sign-ups live in a spreadsheet, tickets are sold for cash at the door, the budget is in a notebook, announcements go out one by one on WhatsApp, and volunteer expenses are reimbursed after chasing receipts. *Members lose track of events, money goes missing, and nobody knows who still owes what.*

## 2. Goals
1. One source of truth for members, memberships and what they have paid.
2. Online ticket sales with member / non-member prices, seat limits, and fast door check-in.
3. One announcement reaches every member and is kept on record.
4. Online merchandise ordering with real stock per size.
5. Fundraiser tasks visible at a glance: what, who, status.
6. A treasurer view of money in, money out, and what is left.

## 3. Non-goals
Not in the brief, so not built: chat or messaging, multi-club support, social feed, seat maps, payroll, budgeting forecasts, refunds workflow (apart from the automatic refund of a late ticket payment whose seat is gone, `D-008`), public member directory, analytics beyond the summaries below.

## 4. Users and roles
| Role | Who | Can do |
|---|---|---|
| Public visitor (non-member) | Anyone | See events, announcements, shop; buy gala tickets and goodies at non-member prices, within the non-member seat and goodie limits |
| Member | Student with an account | Everything above, plus own membership, tickets, orders, expenses, assigned tasks |
| Officer | Elected leadership for the current term (`leadership_roles`) | Manage members, semesters and membership types, events, check-in, announcements, products, fundraisers; view finance summary |
| Treasurer | Officer with position `Treasurer` | Approve, reject and reimburse expenses |
| Volunteer | Any member (e.g. assigned a fundraiser task) | Submit expenses, update own tasks |

Roles nest: the Treasurer can do everything an Officer can, and an Officer everything a Member can. Members, officers and the treasurer each sign in on their own login page (`D-029`); the page only decides where the person lands, and the server checks the role on every request.

## 5. Functional requirements
Each ID maps to tests (`12_TESTING.md`) and microtasks (`14_MICROTASKS.md`).

### Scene 1 — A new student joins (MEM)
| ID | Requirement | Acceptance |
|---|---|---|
| MEM-1 | Register a member (name, email, phone) at the sign-up table or online | Duplicate email (case-insensitive) is rejected |
| MEM-2 | Record a membership for **one semester and one membership type**, with dues and its payment (cash or online). The dues are copied from the type at purchase | Membership shows paid / unpaid; a member has at most one membership per semester |
| MEM-3 | Members whose semester ends within 30 days, and who have not yet bought the next semester, get one renewal reminder | Reminder time is recorded; no second reminder for the same membership |
| MEM-4 | Check in seconds whether a person is an active member | Result shows active / not active, the semester, the type and the semester end date |
| MEM-5 | Member prices on tickets and merchandise apply automatically to active members of any type | Expired or unpaid members pay the non-member price |
| MEM-6 | Record the elected leadership team per term year | Roles drive officer / treasurer permissions |
| MEM-7 | Officers define semesters (name, start date, end date) and membership types (name, dues per semester, offered or not) *(added after the brief, `D-024`)* | Semesters cannot overlap; names are unique; a type can be retired without deleting past memberships |

### Scene 2 — Selling tickets for the spring gala (TIX)
| ID | Requirement | Acceptance |
|---|---|---|
| TIX-1 | Create events with ticket types: member price, non-member price, seat limit, **non-member seat limit** | Prices ≥ 0, seat limit > 0, 0 ≤ non-member seat limit ≤ seat limit (0 = members only) |
| TIX-2 | Sell tickets online to members **and non-members**; price depends on whether the ticket holder is an active member | Server picks the price per holder |
| TIX-3 | Never sell more tickets than the seat limit, and never more non-member tickets than the non-member seat limit, even under concurrent purchases | 200 simultaneous buyers for 100 seats ⇒ exactly 100 tickets; 50 simultaneous non-members for 10 non-member seats ⇒ exactly 10 |
| TIX-4 | Show seats left, in total and for non-members | Matches tickets sold |
| TIX-5 | Every ticket has a unique code shown as a QR code | Code is unguessable |
| TIX-6 | Door check-in by scanning or typing the code, without a printed list | Result in seconds: admitted / already used / unpaid / not found / wrong event |
| TIX-7 | After the event show tickets sold, people who showed up, and money made | Numbers match the data |

### Scene 3 — Announcing the next meeting (ANN)
| ID | Requirement | Acceptance |
|---|---|---|
| ANN-1 | An officer posts one announcement (title, body) | Stored with author and time |
| ANN-2 | It appears on the website and is emailed to every member | Every member email is queued |
| ANN-3 | Past announcements stay listed, newest first | Nothing is lost in a chat |

### Scene 4 — Ordering hoodies (MER)
| ID | Requirement | Acceptance |
|---|---|---|
| MER-1 | Catalogue of goodies (hoodies, T-shirts) with sizes and stock per size, and a **non-member limit** per product | Stock is never negative; limit ≥ 0 (0 = members only) |
| MER-2 | Members and non-members order from their phone at any hour; non-members give a name and an email | Order has items, quantities, unit prices; a non-member order has no member |
| MER-3 | Online payment for the order | Order becomes `paid` after confirmed payment |
| MER-4 | Stock drops when an order is placed and returns if it is cancelled or expires unpaid | Concurrent orders cannot oversell |
| MER-5 | Officers see stock per size, non-member units taken and left, and all orders | Filter by status |
| MER-6 | Non-members get goodies **first come, first served**: the product's non-member limit is shared by all non-members across sizes and used up in the order orders are placed; a cancelled or expired order gives its units back | 20 simultaneous non-member orders for 5 units ⇒ exactly 5 units are given out; members are held back only by stock |

### Scene 5 — Planning a fundraiser (FUN)
| ID | Requirement | Acceptance |
|---|---|---|
| FUN-1 | Create a fundraiser with date and goal | Goal optional |
| FUN-2 | Split work into tasks, assign each to a member, set status and due date | Statuses: todo, in progress, done |
| FUN-3 | At-a-glance progress: tasks done vs total, who is doing what, money raised vs goal | One screen |
| FUN-4 | Record money raised by the fundraiser | Counts in the treasurer totals |

### Scene 6 — The treasurer closes the books (TRS)
| ID | Requirement | Acceptance |
|---|---|---|
| TRS-1 | Money in by category: dues, tickets, merchandise, fundraisers | Totals equal the sum of payments |
| TRS-2 | Volunteers submit expenses with a receipt, optionally tied to an event or fundraiser | Receipt link is stored |
| TRS-3 | Treasurer approves, rejects, then reimburses; reimbursement date is recorded | Nobody approves their own expense |
| TRS-4 | One view: money in, money out (reimbursed), money left | Any officer can read it |
| TRS-5 | "Who still owes what": unpaid dues, unpaid orders, approved but unreimbursed expenses | Lists with names and amounts |

## 6. Assumptions (flagged for confirmation)
1. Memberships are **semester-wise**: each is for one named semester and one membership type, and expires on the semester's end date. Semesters and types are defined by officers; the type names, dues and semester dates are not fixed here (`D-024`). Leadership term year stays a calendar year.
2. Ticket holders are identified by email; an email matching an active member gets the member price.
3. Officers record cash payments (dues at the sign-up table, fundraiser takings). Ticket and merchandise sales are online.
4. The club is in India; currency is INR.
5. Zero-dues memberships are not expected (see `04_DATA_MODEL.md`, known limitations).
6. Membership types differ in name and dues only. Every type gets the same member prices, because the brief has one member price. Different discounts per type would be a new decision.
7. The non-member seat limit is a ceiling inside the total seats, not a reserved block: members can use any seat that is left. The non-member goodie limit is one number per product, shared across its sizes (`D-025`, `D-026`).
8. Non-members have no account; they are identified by the name and email they give at purchase.

## 7. Phasing
- **Phase 1 — Core:** backend + web covering all requirements above.
- **Phase 2 — Mobile + AdMob:** Expo app for members and door check-in, banner ads (`10_ADMOB.md`).
- **Phase 3 — Launch hardening:** `13_PRODUCTION_CHECKLIST.md`.

## 8. Success measures (tied to the brief's pain points)
| Pain point | Measure |
|---|---|
| Lose track of events | Every announcement and event is on one site; 100% of members emailed |
| Money goes missing | Treasurer balance equals the sum of recorded payments minus reimbursed expenses, always |
| Nobody knows who owes what | `outstanding` list available at any time |
| Slow door | Check-in result in under 1 second on a normal phone connection |

## 9. Open questions
- Who is the AdMob account owner, and is ad revenue club income? (`D-015`)
- Which payment gateway and email provider will the club use? (`D-009`, `D-011`)
- Do members need an unsubscribe option for announcement emails? Not in the brief.
