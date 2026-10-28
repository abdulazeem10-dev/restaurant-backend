# Foodway client handoff

**Review status:** MVP demonstration build; production launch is not yet verified.  
**Last reviewed:** 2026-10-21

## What is included

- Sunrise Tiffin House breakfast storefront, menu browsing, cart, checkout, order history, order status updates, notifications, reviews, saved addresses, and opt-in location sharing. Customer-facing APIs must not show or accept other restaurant records.
- Separate platform admin, Sunrise owner/staff, and delivery dashboards with role-scoped workflows. The Sunrise owner creates and manages delivery accounts; platform admin manages only Sunrise owner access, subscription, and approval.
- Restaurant menu and service settings, named delivery areas with PIN coverage, delivery assignment acceptance/decline, and delivery completion.
- Responsive website and Android WebView/PWA options using the same API and MongoDB data.
- Optional Google sign-in, phone OTP, email, and SMS integrations when correctly configured.

## Client-visible limitations

| Area | Current behavior | Client impact |
| --- | --- | --- |
| Online payments | Checkout stores online/UPI as a preference. It does not charge a card/UPI account or create a QR. COD is the implemented collection flow. | Do not accept online payment orders as paid. A provider integration must be completed and verified before claiming online payments are supported. |
| Fees | Tax and delivery charges are currently zero. | Agree on commercial rules and implement/configure them before launch. |
| Sunrise service coverage | Delivery PIN codes are grouped under Sunrise service areas and checked at checkout. The customer site is not a restaurant directory. | Configure Sunrise's actual hours, menu, delivery areas, and contact details before launch. |
| Tracking | Location sharing is opt-in and refreshes by polling; maps provide visual context and external map links. | It is not turn-by-turn navigation and freshness depends on GPS permission, connectivity, and refresh interval. |
| Notifications | In-app records are available; email and SMS depend on provider setup and delivery rules. | Verify each channel with production credentials and real devices before promising delivery. |
| Deployment portability | The browser client currently points to the Foodway Vercel API URL in source. | Changing hosting environments requires updating and rebuilding/redeploying the frontend API base URL. |
| Mobile distribution | The Android build workflow makes a debug APK for direct review. | It is not a Play Store release. Store distribution needs a signed production build and release process. |
| Operations | This repository is an MVP. Monitoring, restore drills, audited operational procedures, and broad automated end-to-end coverage are not established by the code alone. | Assign an owner and complete the launch checklist below before serving real customer traffic. |

## Before client acceptance / production

### Client decisions and content

- Confirm Sunrise owner contact, approved breakfast menu, prices, images, weekly hours, delivery PIN codes, delivery/preparation estimates, and item availability.
- Confirm supported payment methods, tax treatment, delivery fees, cancellation/refund policy, customer support contact, and operating hours.
- Approve privacy notice, terms, data retention/deletion policy, location-sharing explanation, and any required local compliance language.
- Decide whether acceptance is for an MVP demonstration or a live commercial launch.

### Configuration and operations

- Configure production MongoDB, a unique high-entropy JWT secret, allowed frontend origin, HTTPS domains, and deployment secrets in the hosting secret manager.
- Create the initial platform administrator through the controlled provisioning path; verify least-privilege accounts and rotate temporary credentials.
- Configure and test Google, Twilio, Resend, and other optional providers only if approved. Keep keys out of source control and frontend code.
- If online payments are required, mount the payment API, connect checkout to the provider, configure server-side secrets and signed webhooks, and verify duplicate callbacks, failed/abandoned payments, reconciliation, refunds, and settlement in sandbox and production.
- Enable database backups with retention, perform a restore drill to a separate environment, configure uptime/error monitoring and alert ownership, and define incident response/escalation.
- If running multiple backend instances, use a shared rate-limit store; the current in-memory store is per process.
- Run an end-to-end review of customer ordering, role access, restaurant fulfillment, delivery accept/decline/completion, location privacy, notifications, and mobile behavior on real devices.
- For Play Store delivery, create a signed release build and protect the signing key. The current debug APK is for review/testing only.

## Suggested acceptance walkthrough

1. Customer creates an account, browses Sunrise's available breakfast dishes, and places a COD order.
2. Restaurant account receives the order, advances preparation, and marks it ready for pickup.
3. Delivery partner accepts the offer, uses the address/map link, optionally shares GPS, and completes delivery.
4. Customer sees delivery completion, confirms receipt, and submits a review; restaurant staff can see the resulting order/review state.
5. Admin, owner, staff, and delivery accounts are checked for correct dashboard routing and authorization boundaries.

## Honest release statement

Foodway is suitable for a guided MVP/client demonstration after deployment and sample business data are verified. The repository alone does not establish production readiness, payment acceptance, compliance approval, or an uptime guarantee. Agree on and close the items above before representing those capabilities as live.
