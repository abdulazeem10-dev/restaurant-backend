# Sunrise Tiffin House Implementation Roadmap

## Current Sunrise implementation
- Express app with Helmet, CORS allowlist, request-size limit, and API rate limit
- MongoDB connection
- User, Restaurant, MenuItem, Order, Subscription, Delivery, Payment models
- Customer registration and login
- JWT authentication and role middleware
- Public APIs restricted to the approved Sunrise Tiffin House profile, menu, reviews, and customer order creation
- Restaurant-owned menu read/create/update/delete routes
- Admin-only restaurant and owner-account onboarding, approval, rejection, and suspension
- Sunrise breakfast storefront, menu filters, cart, checkout, and order history screens
- Restaurant menu availability and open/close controls
- Dine-in table bills, menu availability controls, restaurant order management, and kitchen queue
- Local one-time admin provisioning script
- Basic API tests

## Remaining work, in order
1. Verify customer → Sunrise kitchen → delivery end to end with production-like accounts.
2. Verify public APIs reject non-Sunrise restaurant IDs and Sunrise is the only restaurant returned to customer pages.
3. Complete release testing for login, account recovery, role access, dish availability, table billing, order status, and delivery handoff.
4. Configure and verify payment and notification providers before presenting them as available.
5. Add operational logging, monitoring, backups/restore drills, and deployment checks before production use.

## Before production
- Add login and registration rate limiting by IP and account identifier.
- Consider secure HttpOnly cookies, CSRF protection, and token revocation.
- Add audit logs for admin actions and sensitive changes.
- Validate every request with schemas; reject unknown fields.
- Ensure restaurant ownership is checked in every read/write query.
- Verify payment webhook signatures against raw request bytes.
- Use provider idempotency keys and unique event IDs.
- Never store card details yourself.
- Review Indian tax, food business, consumer protection, privacy, payment, and delivery obligations with qualified professionals.
