-- =====================================================================
-- Student Organization System: PostgreSQL schema
-- Skyline Student Association
-- Requires PostgreSQL 13+ (uses gen_random_uuid()) and btree_gist
-- 17 tables, 7 views, triggers for zero-oversell & non-member limits
-- =====================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ---------------------------------------------------------------------
-- 1. MEMBERS & LEADERSHIP
--    "A new student joins": who they are, whether they paid dues.
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
-- 2. SEMESTERS & MEMBERSHIP TYPES (D-024)
-- ---------------------------------------------------------------------
CREATE TABLE semesters (
    semester_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,              -- e.g. 'Fall 2026'
    starts_on   DATE NOT NULL,
    ends_on     DATE NOT NULL,
    CHECK (ends_on > starts_on),
    CONSTRAINT semesters_daterange_excl EXCLUDE USING gist (daterange(starts_on, ends_on, '[]') WITH &&)
);
CREATE INDEX semesters_dates_idx ON semesters (starts_on, ends_on);

CREATE TABLE membership_types (
    membership_type_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name               TEXT          NOT NULL,     -- e.g. 'Basic', 'Plus', 'Premium'
    dues_amount        NUMERIC(10,2) NOT NULL CHECK (dues_amount >= 0),
    is_offered         BOOLEAN       NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX membership_types_name_uq ON membership_types (LOWER(name));

-- ---------------------------------------------------------------------
-- 3. FUNDRAISERS (created early because payments can point to them)
-- ---------------------------------------------------------------------
CREATE TABLE fundraisers (
    fundraiser_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title         TEXT    NOT NULL,                -- e.g. 'Bake sale'
    description   TEXT,
    event_date    DATE,
    goal_amount   NUMERIC(10,2) CHECK (goal_amount IS NULL OR goal_amount >= 0)
);

-- ---------------------------------------------------------------------
-- 4. PAYMENTS: every rupee that comes in (dues, tickets, merch, fundraisers)
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
    external_ref  TEXT UNIQUE,                             -- D-020 (reconciliation, webhook idempotency)
    CHECK ((category = 'fundraiser') = (fundraiser_id IS NOT NULL))
);
CREATE INDEX payments_category_idx ON payments (category);

-- ---------------------------------------------------------------------
-- 5. MEMBERSHIPS (D-024)
--    One member, one semester, one type. Dues snapshot copied at purchase.
-- ---------------------------------------------------------------------
CREATE TABLE memberships (
    membership_id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    member_id                BIGINT        NOT NULL REFERENCES members (member_id),
    semester_id              BIGINT        NOT NULL REFERENCES semesters (semester_id),
    membership_type_id       BIGINT        NOT NULL REFERENCES membership_types (membership_type_id),
    dues_amount              NUMERIC(10,2) NOT NULL CHECK (dues_amount >= 0),
    payment_id               BIGINT REFERENCES payments (payment_id),
    renewal_reminder_sent_at TIMESTAMPTZ,
    UNIQUE (member_id, semester_id)
);
CREATE INDEX memberships_member_idx ON memberships (member_id, semester_id);

-- ---------------------------------------------------------------------
-- 6. EVENTS AND TICKETS (D-025)
-- ---------------------------------------------------------------------
CREATE TABLE events (
    event_id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title       TEXT        NOT NULL,              -- e.g. 'Spring Gala'
    description TEXT,
    venue       TEXT,
    starts_at   TIMESTAMPTZ NOT NULL
);

-- Prices, total seat limit and non-member seat limit
CREATE TABLE ticket_types (
    ticket_type_id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id               BIGINT        NOT NULL REFERENCES events (event_id),
    name                   TEXT          NOT NULL DEFAULT 'General',
    member_price           NUMERIC(10,2) NOT NULL CHECK (member_price >= 0),
    non_member_price       NUMERIC(10,2) NOT NULL CHECK (non_member_price >= 0),
    seat_limit             INTEGER       NOT NULL CHECK (seat_limit > 0),
    non_member_seat_limit  INTEGER       NOT NULL CHECK (non_member_seat_limit >= 0 AND non_member_seat_limit <= seat_limit),
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

-- Prevent selling more tickets than the seat limit (both total and non-member ceiling)
CREATE OR REPLACE FUNCTION enforce_seat_limit() RETURNS trigger AS $$
DECLARE
    v_seat_limit           INTEGER;
    v_non_member_seat_limit INTEGER;
    v_sold                 INTEGER;
    v_non_member_sold      INTEGER;
BEGIN
    SELECT seat_limit, non_member_seat_limit
    INTO v_seat_limit, v_non_member_seat_limit
    FROM ticket_types
    WHERE ticket_type_id = NEW.ticket_type_id
    FOR UPDATE;                                    -- serialises concurrent sales

    SELECT COUNT(*),
           COUNT(CASE WHEN member_id IS NULL THEN 1 END)
    INTO v_sold, v_non_member_sold
    FROM tickets
    WHERE ticket_type_id = NEW.ticket_type_id;

    IF v_sold >= v_seat_limit THEN
        RAISE EXCEPTION 'Sold out: ticket type % has no seats left', NEW.ticket_type_id;
    END IF;

    IF NEW.member_id IS NULL AND v_non_member_sold >= v_non_member_seat_limit THEN
        RAISE EXCEPTION 'Sold out for non-members: ticket type % has no non-member seats left', NEW.ticket_type_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tickets_seat_limit
    BEFORE INSERT ON tickets
    FOR EACH ROW EXECUTE FUNCTION enforce_seat_limit();

-- ---------------------------------------------------------------------
-- 7. ANNOUNCEMENTS: one post, plus a record of what was said and when
-- ---------------------------------------------------------------------
CREATE TABLE announcements (
    announcement_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title           TEXT        NOT NULL,
    body            TEXT        NOT NULL,
    posted_by       BIGINT      NOT NULL REFERENCES members (member_id),
    posted_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 8. MERCHANDISE (D-026): sizes, orders, payment, stock, non-member limits
-- ---------------------------------------------------------------------
CREATE TABLE products (
    product_id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name             TEXT          NOT NULL,           -- e.g. 'Club Hoodie'
    description      TEXT,
    price            NUMERIC(10,2) NOT NULL CHECK (price >= 0),        -- non-member price
    member_price     NUMERIC(10,2) NOT NULL CHECK (member_price >= 0), -- member price
    non_member_limit INTEGER       NOT NULL DEFAULT 0 CHECK (non_member_limit >= 0) -- 0 = members only
);

CREATE TABLE product_variants (
    variant_id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id     BIGINT   NOT NULL REFERENCES products (product_id),
    size           TEXT     NOT NULL,              -- S, M, L, XL ...
    stock_quantity INTEGER  NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
    UNIQUE (product_id, size)
);

CREATE TABLE orders (
    order_id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    member_id   BIGINT REFERENCES members (member_id),  -- NULL for non-members
    buyer_name  TEXT,                                   -- required if member_id IS NULL
    buyer_email TEXT,                                   -- required if member_id IS NULL
    ordered_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    status      TEXT        NOT NULL DEFAULT 'placed'
                CHECK (status IN ('placed', 'paid', 'cancelled')),
    payment_id  BIGINT REFERENCES payments (payment_id),
    CHECK ((member_id IS NOT NULL) OR (buyer_name IS NOT NULL AND buyer_email IS NOT NULL))
);
CREATE INDEX orders_member_idx ON orders (member_id);

CREATE TABLE order_items (
    order_id   BIGINT        NOT NULL REFERENCES orders (order_id) ON DELETE CASCADE,
    variant_id BIGINT        NOT NULL REFERENCES product_variants (variant_id),
    quantity   INTEGER       NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0),
    PRIMARY KEY (order_id, variant_id)
);

-- Enforce non-member goodie quota on placed or paid orders (first come first served)
CREATE OR REPLACE FUNCTION enforce_non_member_goodie_limit() RETURNS trigger AS $$
DECLARE
    v_product_id       BIGINT;
    v_limit            INTEGER;
    v_ordered          INTEGER;
    v_order_member_id  BIGINT;
BEGIN
    SELECT member_id INTO v_order_member_id
    FROM orders WHERE order_id = NEW.order_id;

    -- Members are bounded by stock only, not the non-member limit
    IF v_order_member_id IS NOT NULL THEN
        RETURN NEW;
    END IF;

    SELECT product_id INTO v_product_id
    FROM product_variants WHERE variant_id = NEW.variant_id;

    SELECT non_member_limit INTO v_limit
    FROM products WHERE product_id = v_product_id
    FOR UPDATE;

    SELECT COALESCE(SUM(oi.quantity), 0) INTO v_ordered
    FROM order_items oi
    JOIN orders o ON o.order_id = oi.order_id
    JOIN product_variants pv ON pv.variant_id = oi.variant_id
    WHERE pv.product_id = v_product_id
      AND o.member_id IS NULL
      AND o.status IN ('placed', 'paid');

    IF (v_ordered + NEW.quantity) > v_limit THEN
        RAISE EXCEPTION 'Non-member limit reached for product %', v_product_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER order_items_non_member_limit
    BEFORE INSERT ON order_items
    FOR EACH ROW EXECUTE FUNCTION enforce_non_member_goodie_limit();

-- ---------------------------------------------------------------------
-- 9. FUNDRAISER TASKS: who is doing what, and what is still open
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
-- 10. EXPENSES: volunteer expenses reimbursed with receipts (money out)
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
-- VIEWS: 7 ready-made reports answering the scenes
-- =====================================================================

-- 1. Is this person an active member today? (MEM-4)
CREATE OR REPLACE VIEW active_members AS
SELECT m.member_id, m.full_name, m.email, m.phone, m.joined_on,
       s.semester_id, s.name AS semester_name, mt.name AS membership_type,
       s.ends_on AS valid_until
FROM members m
JOIN memberships ms ON ms.member_id = m.member_id
JOIN semesters s ON s.semester_id = ms.semester_id
JOIN membership_types mt ON mt.membership_type_id = ms.membership_type_id
WHERE ms.payment_id IS NOT NULL
  AND CURRENT_DATE BETWEEN s.starts_on AND s.ends_on;

-- 2. Who should be reminded to renew (paid, ends within 30 days, no later paid semester, none sent)
CREATE OR REPLACE VIEW memberships_due_for_renewal AS
SELECT ms.membership_id, m.member_id, m.full_name, m.email, s.ends_on AS valid_until, s.name AS semester_name
FROM memberships ms
JOIN members m ON m.member_id = ms.member_id
JOIN semesters s ON s.semester_id = ms.semester_id
WHERE ms.payment_id IS NOT NULL
  AND ms.renewal_reminder_sent_at IS NULL
  AND s.ends_on BETWEEN CURRENT_DATE AND CURRENT_DATE + 30
  AND NOT EXISTS (
    SELECT 1 FROM memberships later_ms
    JOIN semesters later_s ON later_s.semester_id = later_ms.semester_id
    WHERE later_ms.member_id = ms.member_id
      AND later_ms.payment_id IS NOT NULL
      AND later_s.starts_on > s.starts_on
  );

-- 3. Seats left per ticket type (total and non-member)
CREATE OR REPLACE VIEW ticket_availability AS
SELECT tt.ticket_type_id, e.title AS event, tt.name, tt.seat_limit, tt.non_member_seat_limit,
       COUNT(t.ticket_id) AS sold,
       tt.seat_limit - COUNT(t.ticket_id) AS seats_left,
       COUNT(CASE WHEN t.member_id IS NULL THEN 1 END) AS non_member_sold,
       tt.non_member_seat_limit - COUNT(CASE WHEN t.member_id IS NULL THEN 1 END) AS non_member_seats_left
FROM ticket_types tt
JOIN events e ON e.event_id = tt.event_id
LEFT JOIN tickets t ON t.ticket_type_id = tt.ticket_type_id
GROUP BY tt.ticket_type_id, e.title;

-- 4. After the event: tickets sold, people who showed up, revenue (D-021: counts valid tickets)
CREATE OR REPLACE VIEW event_summary AS
SELECT e.event_id, e.title,
       COUNT(t.ticket_id)                          AS tickets_sold,
       COUNT(t.checked_in_at)                      AS attended,
       COALESCE(SUM(t.price_paid), 0)              AS ticket_revenue
FROM events e
LEFT JOIN ticket_types tt ON tt.event_id = e.event_id
LEFT JOIN tickets t       ON t.ticket_type_id = tt.ticket_type_id AND (t.payment_id IS NOT NULL OR t.price_paid = 0)
GROUP BY e.event_id, e.title;

-- 5. Is the fundraiser on track? (tasks done vs total, money raised vs goal)
CREATE OR REPLACE VIEW fundraiser_progress AS
SELECT f.fundraiser_id, f.title, f.goal_amount,
       (SELECT COUNT(*) FROM fundraiser_tasks x
         WHERE x.fundraiser_id = f.fundraiser_id)                       AS tasks_total,
       (SELECT COUNT(*) FROM fundraiser_tasks x
         WHERE x.fundraiser_id = f.fundraiser_id AND x.status = 'done') AS tasks_done,
       (SELECT COALESCE(SUM(p.amount), 0) FROM payments p
         WHERE p.fundraiser_id = f.fundraiser_id)                       AS amount_raised
FROM fundraisers f;

-- 6. Treasurer: what came in, what went out, what is left
CREATE OR REPLACE VIEW treasurer_summary AS
SELECT 'in'  AS direction, category AS item, SUM(amount) AS total
FROM payments
GROUP BY category
UNION ALL
SELECT 'out', 'reimbursed expenses', COALESCE(SUM(amount), 0)
FROM expenses
WHERE status = 'reimbursed';

-- 7. Club balance: payments in minus reimbursed expenses
CREATE OR REPLACE VIEW club_balance AS
SELECT (SELECT COALESCE(SUM(amount), 0) FROM payments)
     - (SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE status = 'reimbursed')
       AS balance;

COMMIT;
