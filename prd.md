# Food Platform Product Requirements Document

**Status:** Current product scope (MVP)  
**Last updated:** 2026-10-19

## 1. Product summary

Food Platform is a multi-restaurant ordering service focused on helping customers discover nearby independent restaurants, order from their menus, and follow an order through delivery. Restaurant teams manage their storefront and incoming orders, delivery partners handle assigned deliveries, and platform administrators onboard restaurants and delivery accounts.

The website and Android installable app use the same backend and MongoDB data. This document describes the product represented by the current code; it does not imply that every optional provider is configured in a deployment.

## 2. Goals

- Make local restaurant discovery and ordering understandable on desktop and mobile.
- Give customers visibility into order progress, payment method, and delivery status.
- Give restaurant teams role-appropriate tools for menus, service settings, orders, and staff.
- Give delivery partners a focused workflow for accepting assignments, navigating to customer details, sharing location, and completing delivery.
- Give platform administrators a separate workspace for restaurant onboarding and account operations.
- Keep website and Android app data consistent by using one API and database.

## 3. User roles

| Role | Main needs |
| --- | --- |
| Customer | Find restaurants, browse food, place and track orders, manage addresses, request help, and review completed orders. |
| Restaurant primary admin / owner | Manage the restaurant, menu, hours, delivery areas, orders, reports, reviews, and up to three staff roles. |
| Secondary admin | Manage permitted restaurant settings, menu, and orders. |
| Biller / modifier | Manage menu and order tasks needed for daily service. |
| Viewer | Read-only access to permitted restaurant information. |
| Delivery partner | Review and accept or decline delivery offers, see pickup and customer details, share GPS location, and mark delivery complete. |
| Platform admin | Provision restaurants and delivery accounts, approve or suspend restaurants, and maintain platform operations. |

## 4. Product requirements

### 4.1 Customer discovery and ordering

- The customer can browse approved restaurants, search by restaurant or area, filter by food type (all, vegetarian, non-vegetarian), sort results, and filter by delivery PIN code.
- Restaurant listings expose useful service information such as open/closed state, food type, opening hours, named delivery areas with their PIN codes, and available ratings. Customers can search by a named delivery area.
- The customer can view a restaurant menu, see whether a dish is available, choose quantities, and build a cart.
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
- Restaurant staff can receive orders and progress them through confirmation, preparation, ready for pickup, and handoff for delivery.
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
- A platform admin can create pending restaurants with a primary owner login and create delivery partner logins.
- Admins can review restaurant status and approve or suspend restaurants, and update restaurant food type and image details.
- The admin experience is a separate dashboard from the customer storefront.

### 4.5 Android and responsive experience

- The customer website is installable as a Progressive Web App on Android over HTTPS.
- The installed app uses the same deployed frontend/API and database as the website; account and order state are shared.
- The interface must remain usable on narrow mobile screens and desktop widths, including customer checkout and role-specific dashboards.

## 5. Order lifecycle and business rules

The order lifecycle represented in storage is `awaiting_payment`, `placed`, `confirmed`, `preparing`, `ready`, `out_for_delivery`, `picked_up`, `delivered`, and `cancelled`. The UI may group or label these states for clarity. Restaurant staff manage preparation and handoff; only the assigned delivery partner may mark an order delivered. Each order stores status history.

The server calculates prices from current menu items rather than trusting client-submitted totals. Items that become unavailable cannot be ordered. Delivery status, payment method, payment status, payment collection time, and customer receipt time are separate pieces of order data.

## 6. Success criteria

- A customer can complete a valid order from restaurant discovery through checkout and later see its status.
- A restaurant team can manage its service settings and progress an order to delivery handoff using its permitted account role.
- A delivery partner can accept or decline an offer and complete an accepted delivery; other partners cannot complete that delivery.
- A customer can see location sharing when the delivery partner has opted in and location permission is available.
- A platform administrator can onboard a restaurant and delivery partner without creating public admin registration.
- The same account and order records are visible from the web app and Android PWA.

## 7. Current limitations and future work

- Map updates use page/API refresh polling and OpenStreetMap tiles; there is no turn-by-turn routing or websocket-based tracking.
- Online provider checkout is not integrated into the customer flow. UPI QR generation is not implemented. Settlement, refunds, and reconciliation require operational procedures.
- Email and SMS alerts are optional and do not send until providers are configured.
- Taxes and delivery fees default to zero in the current order model unless separately implemented/configured.
- The project is an MVP starter, not a production-ready marketplace. Before broad launch, add operational monitoring, backups, audit trails, payment/refund operations, automated coverage for critical workflows, and a reviewed privacy/security/compliance plan.

## 8. Related documents

- [Architecture](architect.md)
- [Implementation roadmap](docs/IMPLEMENTATION_ROADMAP.md)
