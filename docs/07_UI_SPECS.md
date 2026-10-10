# 07 — UI Specs

Web is responsive and **mobile first**: members order and buy from their phones, and officers check people in on a phone at the door. The mobile app (Phase 2) reuses these screens and rules.

## 1. Principles
1. One primary action per screen.
2. Door and money screens are plain, large, and fast. No decoration, no ads.
3. Every list has loading, empty, and error states.
4. Never rely on colour alone: pair it with an icon and text.
5. Everything a member needs is reachable in three taps from home.

## 2. Design tokens
| Token | Value |
|---|---|
| Primary (Skyline navy) | `#0F172A` |
| Accent (sky) | `#0EA5E9` |
| Success | `#16A34A` |
| Warning | `#D97706` |
| Danger | `#DC2626` |
| Surface / background | `#FFFFFF` / `#F8FAFC` |
| Text / muted text | `#0F172A` / `#475569` |
| Font | System UI stack; body 16 px, minimum 14 px |
| Spacing scale | 4, 8, 12, 16, 24, 32 px |
| Radius | 8 px (cards, buttons) |
| Touch target | At least 44 × 44 px |
| Breakpoints | 360 (phone), 768 (tablet), 1024 (desktop) |
| Contrast | WCAG AA (4.5:1 text) |

Light theme at launch; dark theme later only if requested.

## 3. Navigation by role
| Role | Primary navigation |
|---|---|
| Visitor | Home, Events, Announcements, Shop, Sign in |
| Member | Home, Events, Shop, My stuff (membership, tickets, orders, expenses, tasks) |
| Officer | Adds **Manage** (members, events, check-in, announcements, shop, fundraisers) and **Finance** |
| Treasurer | Officer plus expense decisions |

## 4. Screens
### Public and member
| Screen | Contents |
|---|---|
| Home | Next event card, latest 3 announcements, membership status strip (if signed in) |
| Sign in | Email field, "Send me a link", confirmation message |
| Sign up | Name, email, optional phone |
| Events | Upcoming list: title, date, venue, "from ₹…", seats-left badge |
| Event detail | Details, ticket types with member / non-member price, quantity, holder name + email per ticket, member price badge when the email matches an active member, "Pay ₹…" |
| Payment status | Waiting, success with tickets, failed with retry, hold-expired message |
| My tickets | Cards with QR code (large, high contrast), event, holder, status |
| Announcements | Newest first: title, date, author, body |
| Shop | Product grid; product page with size chips showing "Only N left" or "Sold out"; price shows member price when eligible |
| Cart / checkout | Items, total, "Pay ₹…", 15-minute hold notice |
| My membership | Status (Active / Expired / Unpaid), valid until, "Renew" button |
| My orders | Status and items |
| Submit expense | Description, amount, date, optional event or fundraiser, receipt upload, submit |
| My tasks | Tasks assigned to me, change status |

### Officer
| Screen | Contents |
|---|---|
| Members | Search, filter active, row: name, status badge, valid until |
| Member detail | Profile, memberships, record cash dues |
| Verify member | Single search box, large Active / Not active result with expiry (MEM-4) |
| Event manager | Create or edit event, ticket types, prices, seat limit, live seats left, summary (sold, attended, revenue) |
| **Door check-in** | See §5.1 |
| Announcement composer | Title, body, "Post and email all members" with recipient count confirmation |
| Shop manager | Products, sizes, stock editor, orders list with status filter |
| Fundraiser board | Columns **To do / In progress / Done**, task card: title, assignee avatar-initials, due date; header: progress bar (done / total) and raised vs goal |
| Expense queue | Tabs Submitted, Approved, Reimbursed, Rejected; receipt viewer; Approve, Reject, Mark reimbursed (treasurer) |
| **Treasurer dashboard** | See §5.2 |
| Outstanding | Three lists: unpaid dues, unpaid orders, approved-not-reimbursed expenses, each with name and amount |

## 5. Key wireframes
### 5.1 Door check-in
```
┌──────────────────────────────┐
│ Spring Gala        [change]  │
│                              │
│   ┌──────────────────────┐   │
│   │                      │   │
│   │     camera view      │   │
│   │                      │   │
│   └──────────────────────┘   │
│  [ Type ticket code ]        │
│                              │
│  Checked in: 87 / 140 sold   │
└──────────────────────────────┘
```
Result overlay (full screen, auto-dismiss after 2 s or on tap):
| State | Look | Text |
|---|---|---|
| Admitted | Green, check icon | "Admitted: {name}" + "Member" badge when applicable |
| Already used | Amber, warning icon | "Already checked in at {time}" |
| Unpaid | Red, X icon | "Ticket not paid" |
| Wrong event | Red, X icon | "Ticket is for another event" |
| Not found | Red, X icon | "Ticket not found" |
Keep the camera ready for the next scan immediately. Typing a code works if the camera fails.

### 5.2 Treasurer dashboard
```
┌──────────────────────────────────────────┐
│ Club balance                  ₹72,600    │
│ In ₹87,900            Out ₹15,300        │
├──────────────────────────────────────────┤
│ Money in                                 │
│  Dues ........... ₹12,000                │
│  Tickets ........ ₹48,000                │
│  Merchandise .... ₹21,500                │
│  Fundraisers .... ₹ 6,400                │
├──────────────────────────────────────────┤
│ Expenses reimbursed          ₹15,300     │
│ Waiting for you: 3 expenses  [Review]    │
│ Still owed: 5 unpaid dues, 2 orders      │
└──────────────────────────────────────────┘
```
Table below with ledger rows (date, category, amount, who), filter by date and category.

### 5.3 Event detail (mobile)
```
┌──────────────────────────────┐
│ Spring Gala                  │
│ Sat 14 Nov · 7 pm · Main Hall│
│ 38 seats left                │
├──────────────────────────────┤
│ General                      │
│ Member ₹300  Non-member ₹500 │
│ Ticket 1: [name] [email]     │
│ [+ Add ticket]               │
│ Total ₹800        [ Pay ]    │
└──────────────────────────────┘
```

## 6. States
| State | Behaviour |
|---|---|
| Loading | Skeleton placeholders, no spinners over content |
| Empty | One sentence plus the next action ("No events yet. Check back soon.") |
| Error | Message from `08_ERROR_HANDLING.md`, retry button, request ID in small text |
| Offline (mobile) | Banner "You're offline"; ticket QR stays visible from the last load |
| Sold out | Disabled button labelled "Sold out" |

## 7. Forms
- Validate on blur and on submit; messages next to the field; never clear the user's input after an error.
- Email, amount, and date fields use the correct input type and mobile keyboard.
- Destructive or irreversible actions (post announcement to all, mark reimbursed) show a confirmation with the consequence.

## 8. Accessibility
- Full keyboard navigation on web; visible focus ring.
- Labels on all inputs; QR codes have the ticket code as text underneath.
- Announce check-in results to screen readers (`aria-live="assertive"`).
- Respect reduced-motion settings.

## 9. Ad slots (mobile only, Phase 2)
Banner slots appear only on Events list, Announcements list, and Shop list. Never on: event detail with purchase, checkout, payment status, door check-in, finance or any officer-manage screen. Details in `10_ADMOB.md`.
