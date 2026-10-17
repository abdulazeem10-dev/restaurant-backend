# Implementation Roadmap

## Included in this starter
- Express app with Helmet, CORS allowlist, request-size limit, and API rate limit
- MongoDB connection
- User, Restaurant, MenuItem, Order, Subscription, Delivery, Payment models
- Customer registration and login
- JWT authentication and role middleware
- Public approved-restaurant and menu APIs
- Restaurant-owned menu read/create/update/delete routes
- Admin-only restaurant and owner-account onboarding, approval, rejection, and suspension
- Customer restaurant browsing, menu, cart, checkout, and order history screens
- Restaurant menu availability and open/close controls
- Restaurant order status management through ready for pickup
- Local one-time admin provisioning script
- Basic API tests

## Next work, in order
1. Secure customer sessions, account recovery, and login-specific rate limiting.
2. Restaurant profile editing, opening hours, customer contact details, and order notifications.
3. Configure tax, fees, service area, and cancellation rules for the launch region.
4. Choose payment and collection behavior; integrate a payment provider only when ready.
5. Add delivery partner onboarding, dispatch, assignment locking, and delivery status transitions.
6. Add notifications (email/SMS/push) and optional live location.
7. Add integration tests, security review, backups, logging, monitoring, and deployment.

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
