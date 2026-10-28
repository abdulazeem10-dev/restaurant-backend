# Project Memory

This is a concise handoff for future coding sessions. Never store credentials, customer personal data, or access tokens here.

## Product scope

The deployed customer website and Android PWA are for Al-Madina only. They must not show or fall back to legacy/demo restaurants or any other approved restaurant. Platform-admin, Al-Madina owner/staff, and delivery dashboards remain separate. Platform-admin account records do not make restaurants public on the Al-Madina storefront.

## Current architecture

- Static HTML/CSS/browser JavaScript frontend; Node.js/Express/Mongoose backend; MongoDB.
- Public customer profile, menu, reviews, order creation, customer order history, loyalty, and favorite data are limited to the approved `Al-Madina` restaurant record.
- Platform-admin endpoints remain protected and separate from the public customer API.
- Al-Madina restaurant workspace includes menu CRUD/availability, service hours/areas, staff and delivery accounts, dine-in tables and billing, incoming delivery orders, kitchen queue, reports, reviews, and notifications.
- Delivery accounts accept/decline assigned orders, share location, and complete delivery. API permissions remain authoritative.
- The customer PWA shares the same API/database; offline ordering is unavailable.

## Documentation source of truth

Use `prd.md`, `architect.md`, `rules.md`, `phases.md`, and `design.md` together. The user's Al-Madina-only storefront requirement takes precedence over older marketplace wording. The API should fail closed when the Al-Madina account is not approved; it must never select the only other available restaurant.

## Current known gaps

- Verify the Al-Madina-only public API behavior against a database containing Al-Madina and legacy/demo restaurant records.
- Production readiness still requires critical workflow regression coverage, audit trails, monitoring/alerting, backup/restore rehearsal, privacy retention decisions, and payment/incident operations.
- External payment and messaging behavior depends on current code and deployment credentials; verify both before promising a payment or notification capability.
- Location and status updates use polling; maps are not turn-by-turn navigation.

## Working conventions

- Read the relevant requirements and current source before a change; source behavior is authoritative when older notes differ.
- Keep public Al-Madina endpoints scoped to Al-Madina and keep authorization enforced in the API.
- Do not expose secrets or customer data in the repository.
- Update this file when substantial project state changes, including checks run and remaining release work.
