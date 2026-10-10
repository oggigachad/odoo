-- =====================================================================
-- Student Organization System: PostgreSQL schema
-- Skyline Student Association
-- Requires PostgreSQL 13+ (uses gen_random_uuid())
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. MEMBERS
--    "A new student joins": who they are, whether they paid dues.
--    The mailing list for announcements is simply members.email.
-- ---------------------------------------------------------------------
CREATE TABLE members (
    member_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    full_name   TEXT        NOT NULL,
    email       TEXT        NOT NULL,
    phone       TEXT,
    joined_on   DATE        NOT NULL DEFAULT CURRENT_DATE
);
CREATE UNIQUE INDEX members_email_uq ON members (LOWER(email));

-- Leadership team is elected every year (treasurer, president, ...)
CREATE TABLE leadership_roles (
    leadership_role_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    member_id          BIGINT   NOT NULL REFERENCES members (member_id),
    position           TEXT     NOT NULL,          -- e.g. 'Treasurer'
    term_year          SMALLINT NOT NULL,
    UNIQUE (member_id, position, term_year)
);

-- ---------------------------------------------------------------------
-- 2. FUNDRAISERS (created early because payments can point to them)
-- ---------------------------------------------------------------------
CREATE TABLE fundraisers (
    fundraiser_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title         TEXT    NOT NULL,                -- e.g. 'Bake sale'
    description   TEXT,
    event_date    DATE,
    goal_amount   NUMERIC(10,2) CHECK (goal_amount IS NULL OR goal_amount >= 0)
);

-- ---------------------------------------------------------------------
-- 3. PAYMENTS: every rupee that comes in (dues, tickets, merch, fundraisers)
--    Gives the treasurer one place to see money in.
-- ---------------------------------------------------------------------
CREATE TABLE payments (
    payment_id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    member_id     BIGINT REFERENCES members (member_id),   -- NULL for non-member buyers
    category      TEXT          NOT NULL
                  CHECK (category IN ('dues', 'ticket', 'merchandise', 'fundraiser')),
    amount        NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    method        TEXT          NOT NULL CHECK (method IN ('cash', 'online')),
    paid_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
    fundraiser_id BIGINT REFERENCES fundraisers (fundraiser_id),
    CHECK ((category = 'fundraiser') = (fundraiser_id IS NOT NULL))
);
CREATE INDEX payments_category_idx ON payments (category);

-- ---------------------------------------------------------------------
-- 4. MEMBERSHIPS
--    Dues paid, expiry at year end, renewal reminders.
--    Unpaid = payment_id IS NULL.
--    What a membership "gets" is the member price on tickets/merch below.
-- ---------------------------------------------------------------------
CREATE TABLE memberships (
    membership_id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    member_id            BIGINT        NOT NULL REFERENCES members (member_id),
    valid_from           DATE          NOT NULL,
    valid_until          DATE          NOT NULL,
    dues_amount          NUMERIC(10,2) NOT NULL CHECK (dues_amount >= 0),
    payment_id           BIGINT REFERENCES payments (payment_id),
    renewal_reminder_sent_at TIMESTAMPTZ,
    CHECK (valid_until > valid_from)
);
CREATE INDEX memberships_member_idx ON memberships (member_id, valid_until);

-- ---------------------------------------------------------------------
-- 5. EVENTS AND TICKETS
-- ---------------------------------------------------------------------
CREATE TABLE events (
    event_id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title       TEXT        NOT NULL,              -- e.g. 'Spring Gala'
    description TEXT,
    venue       TEXT,
    starts_at   TIMESTAMPTZ NOT NULL
);

-- Different prices for members / non-members and a limit on seats
CREATE TABLE ticket_types (
    ticket_type_id  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id        BIGINT        NOT NULL REFERENCES events (event_id),
    name            TEXT          NOT NULL DEFAULT 'General',
    member_price    NUMERIC(10,2) NOT NULL CHECK (member_price >= 0),
    non_member_price NUMERIC(10,2) NOT NULL CHECK (non_member_price >= 0),
    seat_limit      INTEGER       NOT NULL CHECK (seat_limit > 0),
    UNIQUE (event_id, name)
);

CREATE TABLE tickets (
    ticket_id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ticket_type_id BIGINT        NOT NULL REFERENCES ticket_types (ticket_type_id),
    member_id      BIGINT REFERENCES members (member_id),  -- NULL for non-members
    holder_name    TEXT          NOT NULL,
    holder_email   TEXT,
    price_paid     NUMERIC(10,2) NOT NULL CHECK (price_paid >= 0),
    payment_id     BIGINT REFERENCES payments (payment_id),
    ticket_code    UUID          NOT NULL DEFAULT gen_random_uuid() UNIQUE,  -- scanned at the door
    purchased_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
    checked_in_at  TIMESTAMPTZ,                                              -- NULL = not yet arrived
    checked_in_by  BIGINT REFERENCES members (member_id)
);
CREATE INDEX tickets_type_idx ON tickets (ticket_type_id);

-- Prevent selling more tickets than the seat limit
CREATE FUNCTION enforce_seat_limit() RETURNS trigger AS $$
DECLARE
    v_limit INTEGER;
    v_sold  INTEGER;
BEGIN
    SELECT seat_limit INTO v_limit
    FROM ticket_types WHERE ticket_type_id = NEW.ticket_type_id
    FOR UPDATE;                                    -- serialises concurrent sales

    SELECT COUNT(*) INTO v_sold
    FROM tickets WHERE ticket_type_id = NEW.ticket_type_id;

    IF v_sold >= v_limit THEN
        RAISE EXCEPTION 'Sold out: ticket type % has no seats left', NEW.ticket_type_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tickets_seat_limit
    BEFORE INSERT ON tickets
    FOR EACH ROW EXECUTE FUNCTION enforce_seat_limit();

-- ---------------------------------------------------------------------
-- 6. ANNOUNCEMENTS: one post, plus a record of what was said and when
-- ---------------------------------------------------------------------
CREATE TABLE announcements (
    announcement_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title           TEXT        NOT NULL,
    body            TEXT        NOT NULL,
    posted_by       BIGINT      NOT NULL REFERENCES members (member_id),
    posted_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 7. MERCHANDISE (hoodies, T-shirts): sizes, orders, payment, stock
-- ---------------------------------------------------------------------
CREATE TABLE products (
    product_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name         TEXT          NOT NULL,           -- e.g. 'Club Hoodie'
    description  TEXT,
    price        NUMERIC(10,2) NOT NULL CHECK (price >= 0),
    member_price NUMERIC(10,2) NOT NULL CHECK (member_price >= 0)
);

CREATE TABLE product_variants (
    variant_id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id     BIGINT   NOT NULL REFERENCES products (product_id),
    size           TEXT     NOT NULL,              -- S, M, L, XL ...
    stock_quantity INTEGER  NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
    UNIQUE (product_id, size)
);

CREATE TABLE orders (
    order_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    member_id  BIGINT      NOT NULL REFERENCES members (member_id),
    ordered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    status     TEXT        NOT NULL DEFAULT 'placed'
               CHECK (status IN ('placed', 'paid', 'cancelled')),
    payment_id BIGINT REFERENCES payments (payment_id)
);

CREATE TABLE order_items (
    order_id   BIGINT        NOT NULL REFERENCES orders (order_id) ON DELETE CASCADE,
    variant_id BIGINT        NOT NULL REFERENCES product_variants (variant_id),
    quantity   INTEGER       NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0),
    PRIMARY KEY (order_id, variant_id)
);

-- ---------------------------------------------------------------------
-- 8. FUNDRAISER TASKS: who is doing what, and what is still open
-- ---------------------------------------------------------------------
CREATE TABLE fundraiser_tasks (
    task_id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    fundraiser_id BIGINT NOT NULL REFERENCES fundraisers (fundraiser_id) ON DELETE CASCADE,
    title         TEXT   NOT NULL,                 -- e.g. 'Buy supplies'
    description   TEXT,
    assigned_to   BIGINT REFERENCES members (member_id),
    status        TEXT   NOT NULL DEFAULT 'todo'
                  CHECK (status IN ('todo', 'in_progress', 'done')),
    due_date      DATE
);
CREATE INDEX fundraiser_tasks_idx ON fundraiser_tasks (fundraiser_id, status);

-- ---------------------------------------------------------------------
-- 9. EXPENSES: volunteer expenses reimbursed with receipts (money out)
-- ---------------------------------------------------------------------
CREATE TABLE expenses (
    expense_id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    member_id     BIGINT        NOT NULL REFERENCES members (member_id),  -- volunteer who paid
    description   TEXT          NOT NULL,
    amount        NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    receipt_url   TEXT,
    event_id      BIGINT REFERENCES events (event_id),
    fundraiser_id BIGINT REFERENCES fundraisers (fundraiser_id),
    incurred_on   DATE          NOT NULL DEFAULT CURRENT_DATE,
    submitted_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
    status        TEXT          NOT NULL DEFAULT 'submitted'
                  CHECK (status IN ('submitted', 'approved', 'reimbursed', 'rejected')),
    reimbursed_at TIMESTAMPTZ,
    CHECK ((status = 'reimbursed') = (reimbursed_at IS NOT NULL))
);

-- =====================================================================
-- VIEWS: the "at a glance" answers the scenes ask for
-- =====================================================================

-- Is this person a member right now? (check at the event door)
CREATE VIEW active_members AS
SELECT m.*, ms.valid_until
FROM members m
JOIN memberships ms ON ms.member_id = m.member_id
WHERE ms.payment_id IS NOT NULL
  AND CURRENT_DATE BETWEEN ms.valid_from AND ms.valid_until;

-- Who should be reminded to renew (expiring soon, reminder not yet sent)
CREATE VIEW memberships_due_for_renewal AS
SELECT ms.membership_id, m.member_id, m.full_name, m.email, ms.valid_until
FROM memberships ms
JOIN members m ON m.member_id = ms.member_id
WHERE ms.renewal_reminder_sent_at IS NULL
  AND ms.valid_until BETWEEN CURRENT_DATE AND CURRENT_DATE + 30;

-- Seats left per ticket type
CREATE VIEW ticket_availability AS
SELECT tt.ticket_type_id, e.title AS event, tt.name, tt.seat_limit,
       COUNT(t.ticket_id)                    AS sold,
       tt.seat_limit - COUNT(t.ticket_id)    AS seats_left
FROM ticket_types tt
JOIN events e ON e.event_id = tt.event_id
LEFT JOIN tickets t ON t.ticket_type_id = tt.ticket_type_id
GROUP BY tt.ticket_type_id, e.title;

-- After the event: tickets sold, people who showed up, money made
CREATE VIEW event_summary AS
SELECT e.event_id, e.title,
       COUNT(t.ticket_id)                          AS tickets_sold,
       COUNT(t.checked_in_at)                      AS attended,
       COALESCE(SUM(t.price_paid), 0)              AS ticket_revenue
FROM events e
LEFT JOIN ticket_types tt ON tt.event_id = e.event_id
LEFT JOIN tickets t       ON t.ticket_type_id = tt.ticket_type_id
GROUP BY e.event_id, e.title;

-- Is the fundraiser on track? (tasks done vs total, money raised vs goal)
CREATE VIEW fundraiser_progress AS
SELECT f.fundraiser_id, f.title, f.goal_amount,
       (SELECT COUNT(*) FROM fundraiser_tasks x
         WHERE x.fundraiser_id = f.fundraiser_id)                       AS tasks_total,
       (SELECT COUNT(*) FROM fundraiser_tasks x
         WHERE x.fundraiser_id = f.fundraiser_id AND x.status = 'done') AS tasks_done,
       (SELECT COALESCE(SUM(p.amount), 0) FROM payments p
         WHERE p.fundraiser_id = f.fundraiser_id)                       AS amount_raised
FROM fundraisers f;

-- Treasurer: what came in, what went out, what is left
CREATE VIEW treasurer_summary AS
SELECT 'in'  AS direction, category AS item, SUM(amount) AS total
FROM payments
GROUP BY category
UNION ALL
SELECT 'out', 'reimbursed expenses', COALESCE(SUM(amount), 0)
FROM expenses
WHERE status = 'reimbursed';

CREATE VIEW club_balance AS
SELECT (SELECT COALESCE(SUM(amount), 0) FROM payments)
     - (SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE status = 'reimbursed')
       AS balance;

COMMIT;
