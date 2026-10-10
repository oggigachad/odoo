# Changelog

All notable changes to the Student Organization System. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [Semantic Versioning](https://semver.org/). Add entries under **Unreleased** in every pull request.

## [Unreleased]

### Added
- Project documentation set in `docs/`: master rules, PRD, TRD, architecture, data model, data source, API contract, UI specs, error handling, security, AdMob, GitHub Actions, testing, production checklist, microtasks, decisions.
- `github-workflows/ci.yml` (database, backend, web jobs).

### Changed
- Nothing yet.

### Fixed
- Nothing yet.

### Security
- Nothing yet.

## [0.0.1] - 2026-10-10

### Added
- `database/schema.sql`: PostgreSQL schema with 15 tables (members, leadership_roles, payments, memberships, events, ticket_types, tickets, announcements, products, product_variants, orders, order_items, fundraisers, fundraiser_tasks, expenses), a seat-limit trigger, and 7 views (active_members, memberships_due_for_renewal, ticket_availability, event_summary, fundraiser_progress, treasurer_summary, club_balance).
- Verified on PostgreSQL 16: schema loads from scratch; duplicate emails, negative amounts, and invalid payment/expense states are rejected; the seat limit blocks overselling.

### Known issues (tracked in `docs/15_DECISIONS.md`)
- `event_summary` counts unpaid ticket reservations (`D-021`).
- `memberships_due_for_renewal` includes unpaid memberships (`D-021`).
- `payments` has no gateway reference column (`D-020`).
