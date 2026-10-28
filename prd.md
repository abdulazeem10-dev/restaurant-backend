# Food Platform Product Requirements Document

**Status:** Current product scope (MVP)  
**Last updated:** 2026-10-19

## 1. Product summary

The deployed customer product is a single-restaurant ordering and operations website for Sunrise Tiffin House. Customers browse and order only from Sunrise; its owner and staff manage the menu, service, and orders; its delivery partners handle assigned deliveries. A separate platform-admin workspace provisions and manages the Sunrise owner account and subscription.

The website and Android installable app use the same backend and MongoDB data. This document describes the product represented by the current code; it does not imply that every optional provider is configured in a deployment.

## 2. Goals

- Make Sunrise Tiffin House menu browsing and ordering understandable on desktop and mobile.
- Give customers visibility into order progress, payment method, and delivery status.
- Give restaurant teams role-appropriate tools for menus, service settings, orders, and staff.
- Give delivery partners a focused workflow for accepting assignments, navigating to customer details, sharing location, and completing delivery.
- Give platform administrators a separate workspace to provision owner accounts, record subscription terms and expiry, and renew access.
- Keep website and Android app data consistent by using one API and database.

## 3. User roles

| Role | Main needs |
| --- | --- |
| Customer | Browse Sunrise Tiffin House food, place and track orders, manage addresses, request help, and review completed orders. |
| Restaurant primary admin / owner | Manage the restaurant, menu, hours, delivery areas, orders, reports, reviews, and up to three staff roles. |
| Secondary admin | Manage permitted restaurant settings, menu, and orders. |
| Biller / modifier | Manage menu and order tasks needed for daily service. |
| Viewer | Read-only access to permitted restaurant information. |
| Delivery partner | Review and accept or decline delivery offers, see pickup and customer details, share GPS location, and mark delivery complete. |
| Platform admin | Provision the Sunrise owner login and subscription, collect or record subscription payment, renew access, activate or suspend Sunrise, and maintain the platform. |

## 4. Product requirements

### 4.0 Restaurant account and subscription lifecycle

- The platform admin provisions the Sunrise owner login with name, email, phone, initial password, restaurant profile, and a 1-, 2-, or 3-year subscription term.
- The subscription expiry is visible in the admin workspace. The platform admin can renew a subscription for 1, 2, or 3 years; a renewal extends from the current expiry when still active or from the renewal date when expired.
- Owner and staff API access is blocked after an existing subscription expires. Legacy owner accounts without a subscription record remain accessible until the platform admin records their term.
- Payment collection for subscription terms is not automated in this release; the admin records the subscription period after arranging payment separately.

### 4.1 Customer storefront and ordering

- The customer storefront is branded for Sunrise Tiffin House and presents only that restaurant’s menu, service status, delivery coverage, and breakfast categories. It must not fall back to another approved restaurant when Sunrise is missing or unavailable.
- The Sunrise storefront exposes its open/closed state, opening hours, delivery coverage, menu availability, and ratings. Delivery areas and PIN codes are used to validate checkout, not to discover or switch restaurants.
- The customer can view Sunrise dishes, see whether a dish is available, choose quantities, and build a cart.
- Checkout collects delivery recipient, phone, and address details. The server validates the order against current menu prices, restaurant status, service hours, and delivery coverage.
- The customer can select cash on delivery or record online/UPI as a payment preference. Cash on delivery is the only implemented collection method. Online checkout is not wired to a payment provider, and no UPI QR code is generated.
- When an order PIN matches a named restaurant delivery area, the area name is shown during checkout and saved with the order for restaurant and delivery staff.
- Customers can save delivery addresses, reorder from an earlier order when menu items remain available, and view order history and progress.
- Customers can submit a cancellation request while eligible, contact support about an order, and submit one rating/review for an eligible order.
- Customers can opt in to share their current GPS location with the assigned delivery partner. They can view the delivery partner's shared location on a map while the order is in delivery.
- In-app order notifications are shown to relevant customers and restaurant staff; email/SMS alerts are optional and require provider credentials.

### 4.2 Restaurant operations

- Restaurant owners can manage menu items, categories, prices, food types, images, and customer-facing availability.
- Owners can open or close service, configure weekly opening hours, name their delivery areas and assign 6-digit PIN codes to each area, and set delivery/preparation estimates.
- Restaurant staff can receive delivery orders and progress them through confirmation, preparation, ready for pickup, and handoff for delivery.
- Restaurant staff can open a dine-in order for a table, view the dishes and running total, add dishes while the table is open, record cash/UPI/card payment as collected, and print the final bill. Dine-in orders do not require a customer login or delivery address.
- Restaurant teams can review cancellation and support requests, read customer reviews, and see sales/order reports.
- The primary restaurant admin can create at most one account for each available additional role: secondary admin, biller/modifier, and viewer. They can remove a staff account to free its role for replacement.
- Permissions are enforced by the API as well as by the dashboard UI.

### 4.3 Delivery operations

- An active delivery partner receives an offer with relevant restaurant pickup, customer contact/address, food, order, and payment details.
- The delivery partner can accept or decline an offer. A decline allows reassignment to another eligible partner.
- The partner can open pickup and delivery locations in a map application and can share their GPS location while on an active delivery.
- The assigned partner alone can mark the delivery complete. For cash-on-delivery orders, the completion action records cash collection. The delivery workflow also records the customer's receipt confirmation where applicable.

### 4.4 Platform administration

- Public self-service admin registration is not allowed.
- The platform admin manages the single Sunrise Tiffin House account: owner access, subscription term and payment, approval or suspension, and public profile details.
- The platform admin does not create delivery accounts. The Sunrise owner creates, updates, and deactivates the restaurant's delivery accounts.
- The admin experience is a separate dashboard from the customer storefront.

### 4.5 Android and responsive experience

- The customer website is installable as a Progressive Web App on Android over HTTPS.
- The installed app uses the same deployed frontend/API and database as the website; account and order state are shared.
- The interface must remain usable on narrow mobile screens and desktop widths, including customer checkout and role-specific dashboards.

## 5. Order lifecycle and business rules

The order lifecycle represented in storage is `awaiting_payment`, `placed`, `confirmed`, `preparing`, `ready`, `out_for_delivery`, `picked_up`, `delivered`, and `cancelled`. The UI may group or label these states for clarity. Restaurant staff manage preparation and handoff; only the assigned delivery partner may mark an order delivered. Each order stores status history.

The server calculates prices from current menu items rather than trusting client-submitted totals. Items that become unavailable cannot be ordered. Delivery status, payment method, payment status, payment collection time, and customer receipt time are separate pieces of order data.

## 6. Success criteria

- A customer can complete a valid Sunrise order through checkout and later see its status.
- A restaurant team can manage its service settings and progress an order to delivery handoff using its permitted account role.
- A delivery partner can accept or decline an offer and complete an accepted delivery; other partners cannot complete that delivery.
- A customer can see location sharing when the delivery partner has opted in and location permission is available.
- A platform administrator can provision and manage Sunrise owner access without public admin registration; the Sunrise owner manages delivery accounts.
- The same account and order records are visible from the web app and Android PWA.

## 7. Current limitations and future work

- Map updates use page/API refresh polling and OpenStreetMap tiles; there is no turn-by-turn routing or websocket-based tracking.
- Online provider checkout is not integrated into the customer flow. UPI QR generation is not implemented. Settlement, refunds, and reconciliation require operational procedures.
- Email and SMS alerts are optional and do not send until providers are configured.
- Taxes and delivery fees default to zero in the current order model unless separately implemented/configured.
- The project is an MVP, not a production-ready commercial service. Before broad launch, add operational monitoring, backups, audit trails, payment/refund operations, automated coverage for critical workflows, and a reviewed privacy/security/compliance plan.

## 8. Related documents

- [Architecture](architect.md)
- [Implementation roadmap](docs/IMPLEMENTATION_ROADMAP.md)
