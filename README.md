# Food Platform Starter

A starter MVP scaffold for a multi-restaurant ordering platform. Delivery partner integration is intentionally deferred.

## Stack
- Frontend: HTML, CSS, browser JavaScript
- Backend: Node.js, Express, Mongoose
- Authentication: bcrypt password hashing, JWT access tokens
- Database: MongoDB
- Deployment target: GitHub + Render

## Important
This is a starter project, not a production marketplace. It includes customer registration/login, public restaurant/menu browsing, admin restaurant onboarding and approval, restaurant-owned menu management, customer checkout with cash or online payment preference, saved orders, and restaurant order status updates through ready for pickup. The online choice is recorded as a preference only; the app does not collect online payments. Customer authentication currently stores a short-lived access token in sessionStorage; use a production session strategy before launch. Tax and fee configuration, notifications, refunds, delivery dispatch, and production hardening still need implementation.

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

## Initial admin
For safety, there is no public admin registration endpoint. Create the first admin through a secure one-time local provisioning script or directly in a controlled database process. Do not expose an admin-creation route publicly.

To provision the first admin locally, set `ADMIN_NAME`, `ADMIN_EMAIL`, and a unique `ADMIN_PASSWORD` of at least 16 characters in the environment for a one-time `npm run create-admin` invocation from `backend`. Use your configured `MONGODB_URI`. Do not commit these values or put them in a public frontend.

## API routes
- `GET /api/health`
- `POST /api/auth/register` — customer registration only
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/restaurants`
- `GET /api/restaurants/:id`
- `GET /api/restaurants/:id/menu`
- `GET /api/restaurants/owner/menu` — restaurant owner only
- `POST /api/restaurants/owner/menu` — restaurant owner only
- `PATCH /api/restaurants/owner/menu/:id` — restaurant owner only
- `DELETE /api/restaurants/owner/menu/:id` — restaurant owner only
- `PATCH /api/restaurants/owner/open` — restaurant owner sets open/closed (approved restaurants only)
- `POST /api/orders` — authenticated customer creates an order (server calculates item prices)
- `GET /api/orders/mine` — authenticated customer lists their orders
- `GET /api/orders/restaurant` — authenticated restaurant owner lists its orders
- `PATCH /api/orders/restaurant/:id` — owner advances an order through allowed states
- `GET /api/admin/restaurants` — admin lists restaurants
- `POST /api/admin/restaurants` — admin creates a pending restaurant and owner login
- `PATCH /api/admin/restaurants/:id/status` — admin approves, rejects, or suspends a restaurant

The existing owner menu routes are mounted under `/api/restaurants/owner/menu`.

## Local use
Run the API and serve the `frontend` directory with a static server. Set `FRONTEND_ORIGIN` to that server's origin. You need an approved restaurant and an active restaurant-owner user in MongoDB before it appears publicly. Public self-registration creates customer accounts only. Restaurant account provisioning and approval are still manual and must be done through a controlled process.

Order totals currently include menu item prices only; taxes and delivery fees are zero. Payment collection and delivery fulfillment are not implemented.

## Security baseline
- Never commit `.env`.
- Public registration cannot choose a role.
- Restaurant routes resolve the restaurant from the authenticated owner.
- Never trust prices or totals from the browser.
- Add comprehensive integration tests before production.
