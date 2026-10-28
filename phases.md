# Project Phases

This plan organizes the product into reviewable milestones. It records the current MVP state and a practical order for the remaining launch work; it is not a claim that every deployment has production credentials or operations in place.

## Phase 1 — Foundation and identity

**Status: Implemented; production hardening remains.**

- Static frontend and Node/Express API structure.
- MongoDB/Mongoose models and JWT/password authentication.
- Customer, restaurant, staff, delivery, and admin role boundaries.
- Controlled one-time initial admin provisioning.
- Basic API health endpoint and request security middleware.

**Exit criteria:** API and database start with documented configuration; protected routes enforce role and ownership checks.

## Phase 2 — Al-Madina storefront and ordering

**Status: Implemented.**

- Al-Madina storefront, cuisine and veg/non-veg filters, dish search/filters, and menu availability.
- Al-Madina profile/menu display, cart, checkout, and delivery coverage validation.
- Cart, delivery details, checkout, order history, and reorder/saved addresses.
- Server-calculated totals and validation against current menu/service settings.

**Exit criteria:** a customer can order only from Al-Madina's currently eligible menu and see the saved order.

## Phase 3 — Restaurant operations

**Status: Implemented; continue usability and permission review.**

- Al-Madina owner dashboard and staff accounts for secondary admin, biller/modifier, and viewer.
- Al-Madina menu CRUD and availability, open/close, opening hours, delivery areas, table count, dine-in billing, and kitchen queue.
- Incoming orders, preparation/handoff statuses, support/cancellation requests, reviews, and sales reporting.

**Exit criteria:** each Al-Madina role can perform only its permitted operations and orders can be progressed to delivery handoff.

## Phase 4 — Delivery dispatch and tracking

**Status: Implemented; verify on real devices/networks.**

- Delivery partner accounts and dashboards.
- Assignment offer with accept/decline and reassignment behavior.
- Pickup/customer/order details, location sharing, maps, and delivery completion.
- Cash-on-delivery collection and receipt state recorded at completion.

**Exit criteria:** only the assigned partner can complete an order; customer and partner see permitted location data while sharing is active.

## Phase 5 — Payments and notifications

**Status: Partially implemented; deployment configuration and operations remain.**

- Cash on delivery and order payment state.
- Optional Razorpay checkout, payment signature verification, and webhook processing when credentials are configured.
- In-app notifications; optional email/SMS providers.
- UPI QR choice is currently a preference and does not generate a QR.

**Exit criteria:** configured provider test payments complete end to end; callbacks are verified and idempotent; failures are visible; settlement/refund operations are documented before live launch.

## Phase 6 — Mobile installation and responsive UX

**Status: PWA implemented; validate release experience.**

- Responsive customer and role-specific interfaces.
- Installable Android PWA with a shared API/database and network-first service worker.
- Limited cached shell for offline display; API ordering requires connectivity.

**Exit criteria:** install/update flow, role routing, location permissions, and key screen sizes are checked on target Android devices.

## Phase 7 — Production readiness

**Status: Planned / ongoing.**

- Automated coverage for auth, role boundaries, prices, state transitions, dispatch, location privacy, and payment callbacks.
- Audit logging, backups/restore drills, monitoring/alerting, and incident response.
- Privacy/data retention, regional legal/compliance, refund, settlement, and customer-support procedures.
- Performance and accessibility review; dependency/security update process.

**Exit criteria:** operational owners can detect failures, restore data, investigate sensitive actions, and handle payment and customer incidents before opening broadly.

## Suggested next sequence

1. Run and document end-to-end checks for the critical customer → restaurant → delivery flow.
2. Review authorization and personal/location data handling, then address gaps with regression coverage.
3. Configure staging Razorpay and notification providers and exercise success/failure/webhook paths.
4. Add operational monitoring, audit trails, backups, and a rehearsed restore procedure.
5. Complete accessibility, Android/PWA, and deployment checks before production rollout.

## Related documents

- [Product requirements](prd.md)
- [Architecture](architect.md)
- [Project rules](rules.md)
- [Design system](design.md)
- [Working memory](memory.md)
