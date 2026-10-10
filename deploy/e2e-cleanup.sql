-- Removes everything the use-case test (e2e_prod.py) creates: rows tagged E2E / e2e-... only.
BEGIN;
DELETE FROM order_items WHERE variant_id IN (SELECT v.variant_id FROM product_variants v JOIN products p ON p.product_id = v.product_id WHERE p.name LIKE 'E2E%');
DELETE FROM orders WHERE NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = orders.order_id);
DELETE FROM tickets WHERE ticket_type_id IN (SELECT t.ticket_type_id FROM ticket_types t JOIN events e ON e.event_id = t.event_id WHERE e.title LIKE 'E2E%');
DELETE FROM ticket_types WHERE event_id IN (SELECT event_id FROM events WHERE title LIKE 'E2E%');
DELETE FROM expenses WHERE description LIKE 'E2E%';
DELETE FROM fundraiser_tasks WHERE fundraiser_id IN (SELECT fundraiser_id FROM fundraisers WHERE title LIKE 'E2E%');
DELETE FROM memberships WHERE member_id IN (SELECT member_id FROM members WHERE email LIKE 'e2e-%@student.edu.in');
DELETE FROM payments WHERE external_ref LIKE 'pay_E2E%' OR member_id IN (SELECT member_id FROM members WHERE email LIKE 'e2e-%@student.edu.in');
DELETE FROM notifications WHERE title LIKE '%E2E%' OR member_id IN (SELECT member_id FROM members WHERE email LIKE 'e2e-%@student.edu.in');
DELETE FROM announcements WHERE title LIKE 'E2E%';
DELETE FROM leadership_roles WHERE member_id IN (SELECT member_id FROM members WHERE email LIKE 'e2e-%@student.edu.in');
DELETE FROM members WHERE email LIKE 'e2e-%@student.edu.in';
DELETE FROM fundraisers WHERE title LIKE 'E2E%';
DELETE FROM events WHERE title LIKE 'E2E%';
DELETE FROM product_variants WHERE product_id IN (SELECT product_id FROM products WHERE name LIKE 'E2E%');
DELETE FROM products WHERE name LIKE 'E2E%';
COMMIT;
