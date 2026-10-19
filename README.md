# Food Platform Starter

A starter MVP scaffold for a multi-restaurant ordering platform, including basic delivery-partner assignment, payment collection state, and customer receipt confirmation.

## Stack
- Frontend: HTML, CSS, browser JavaScript
- Backend: Node.js, Express, Mongoose
- Authentication: bcrypt password hashing, JWT access tokens
- Database: MongoDB
- Deployment target: GitHub + Render

## Important
This is a starter project, not a production marketplace. It includes customer registration/login, public restaurant/menu browsing, admin restaurant onboarding and approval, restaurant-owned menu management, customer checkout with cash or online payment preference, saved orders, and restaurant order status updates through ready for pickup. New orders are assigned to the active delivery person with the fewest open assignments; delivery accounts are created by an admin. Delivery people see the customer's contact and address, restaurant pickup address, ordered dishes, payment mode, and payment status; they can confirm COD cash collection while marking delivery. Customers can confirm receipt after delivery. UPI/card/net banking and UPI QR remain preferences only unless a payment integration is configured. Customer authentication currently stores a short-lived access token in sessionStorage; use a production session strategy before launch. Tax and fee configuration, notifications, refunds, live GPS tracking, and production hardening still need implementation.

## Requirements
- Node.js 20+
- MongoDB locally or MongoDB Atlas

## Setup
1. Copy `backend/.env.example` to `backend/.env`.
2. Generate a secret:
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```
3. Put the generated value in `JWT_SECRET` in `backend/.env`.
4. Configure `MONGODB_URI`.
5. Install and run:
   ```bash
   cd backend
   npm install
   npm run dev
   ```
6. Open `http://localhost:5000/api/health`.
7. Serve the `frontend` directory using a local static server (for example VS Code Live Server). Set `FRONTEND_ORIGIN` to that server's exact origin.

## Payment preference
Checkout lets customers choose online UPI/cards/net banking, UPI QR, or cash on delivery. The online and UPI QR choices are stored with the order as preferences for the restaurant to see; no payment is started, QR is generated, or money collected.

## Customer phone sign-in
Phone sign-in sends and checks SMS one-time passwords through Twilio Verify. Create a Verify Service, then configure these backend environment variables (keep the auth token private): `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_VERIFY_SERVICE_SID`. Phone sign-in is for active customer accounts and accepts Indian 10-digit numbers or E.164 numbers such as `+919876543210`. Password and Google sign-in remain available.

## Restaurant hours and delivery areas
Restaurant owners can set weekly opening hours in India Standard Time and list the 6-digit PIN codes they deliver to. Customers can filter restaurants by PIN, see today's hours and listed delivery areas, and checkout/order requests are checked against the restaurant's hours and delivery PIN list. Restaurants without a saved PIN list remain unrestricted until the owner configures one.

The platform admin creates each restaurant's primary admin account (the owner). The primary admin can then create one account for each additional role: secondary admin, biller/modifier, and viewer, and can remove accounts to free a role for a replacement. Secondary admins can manage restaurant settings, menus, and orders. Biller/modifier accounts can manage menus and update order statuses. Viewers have read-only access.

## Ratings and reviews
Customers can submit one 1–5 star rating and an optional comment for each order after the restaurant marks it ready. Restaurant cards and menu pages show the average score, review count, and recent feedback; restaurant owners can read their reviews in the dashboard.

## Order tracking and saved addresses
Customer orders show a progress timeline and refresh automatically while the orders page is open. Orders progress through placed, preparing, ready for pickup, out for delivery, and delivery done. Restaurant staff manage the flow through out for delivery; only the assigned delivery person can mark delivery done. Restaurant status changes are timestamped. Customers can save up to 10 delivery addresses, select one at checkout, or remove saved addresses. Reordering checks the current menu and excludes dishes that are no longer available.

## Menu availability
Restaurant owners can switch each menu item between available and unavailable from the dashboard. Unavailable dishes are hidden from customers and cannot be added to a new order.

## Initial admin
For safety, there is no public admin registration endpoint. Create the first admin through a secure one-time local provisioning script or directly in a controlled database process. Do not expose an admin-creation route publicly.

To provision the first admin locally, set `ADMIN_NAME`, `ADMIN_EMAIL`, and a unique `ADMIN_PASSWORD` of at least 16 characters in the environment for a one-time `npm run create-admin` invocation from `backend`. Use your configured `MONGODB_URI`. Do not commit these values or put them in a public frontend.

## API routes
- `GET /api/health`
- `POST /api/auth/register` — customer registration only
- `POST /api/auth/login`
- `POST /api/auth/phone/otp/request` — sends a rate-limited sign-in code to a matching active customer account
- `POST /api/auth/phone/otp/verify` — verifies the SMS code and creates a customer session
- `GET /api/auth/me`
- `GET /api/restaurants` — lists approved restaurants, with optional `?pincode=400001` coverage filter
- `GET /api/restaurants/:id`
- `GET /api/restaurants/:id/menu`
- `GET /api/restaurants/owner/menu` — restaurant owner only
- `POST /api/restaurants/owner/menu` — restaurant owner only
- `PATCH /api/restaurants/owner/menu/:id` — restaurant owner only
- `DELETE /api/restaurants/owner/menu/:id` — restaurant owner only
- `PATCH /api/restaurants/owner/open` — restaurant owner sets open/closed (approved restaurants only)
- `PATCH /api/restaurants/owner/service-settings` — owner updates opening hours and delivery PIN codes
- `GET /api/restaurants/owner/staff` — primary restaurant admin lists staff accounts
- `POST /api/restaurants/owner/staff` — primary restaurant admin creates a secondary admin, biller/modifier, or viewer login
- `DELETE /api/restaurants/owner/staff/:staffId` — primary restaurant admin removes a staff login
- `GET /api/reviews/restaurant/:id` — public restaurant rating and recent reviews
- `GET /api/reviews/restaurant/mine` — restaurant owner's reviews
- `POST /api/reviews` — customer reviews one of their ready orders
- `POST /api/orders` — authenticated customer creates an order (server calculates item prices)
- `GET /api/orders/mine` — authenticated customer lists their orders
- `GET /api/customer/addresses` — customer lists their saved delivery addresses
- `POST /api/customer/addresses` — customer saves a delivery address (up to 10)
- `DELETE /api/customer/addresses/:id` — customer deletes one of their saved addresses
- `GET /api/orders/restaurant` — authenticated restaurant owner lists its orders
- `PATCH /api/orders/restaurant/:id` — owner advances an order through allowed states
- `GET /api/orders/delivery/mine` — delivery person lists assigned orders and pickup/drop-off details
- `PATCH /api/orders/delivery/:id` — assigned delivery person marks pickup/delivery and records COD cash collection
- `PATCH /api/orders/:id/received` — customer confirms they received a delivered order
- `GET /api/admin/restaurants` — admin lists restaurants
- `POST /api/admin/restaurants` — admin creates a pending restaurant and owner login
- `POST /api/admin/delivery-partners` — admin creates an active delivery login
- `PATCH /api/admin/restaurants/:id/status` — admin approves, rejects, or suspends a restaurant

The existing owner menu routes are mounted under `/api/restaurants/owner/menu`.

## Local use
Run the API and serve the `frontend` directory with a static server. Set `FRONTEND_ORIGIN` to that server's origin. You need an approved restaurant and an active restaurant-owner user in MongoDB before it appears publicly. Public self-registration creates customer accounts only. Restaurant account provisioning and approval are still manual and must be done through a controlled process.

Order totals currently include menu item prices only; taxes and delivery fees are zero. Delivery assignment is account-based and uses restaurant/customer text addresses; it does not include live GPS location, distance routing, dispatch notifications, or partner availability controls. Orders are rejected temporarily when no active delivery account exists; create one from the admin dashboard before accepting orders.

## Security baseline
- Never commit `.env`.
- Public registration cannot choose a role.
- Restaurant routes resolve the restaurant from the authenticated owner.
- Never trust prices or totals from the browser.
- Add comprehensive integration tests before production.
