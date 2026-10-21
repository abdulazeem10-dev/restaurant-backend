# Food Platform Starter

A starter MVP scaffold for a multi-restaurant ordering platform, including basic delivery-partner assignment, payment collection state, and customer receipt confirmation.

## Project documentation
- [Product requirements](prd.md)
- [Architecture](architect.md)
- [Project rules](rules.md)
- [Project phases](phases.md)
- [Design guide](design.md)
- [Working memory](memory.md)
- [Implementation roadmap](docs/IMPLEMENTATION_ROADMAP.md)
- [Client handoff and launch gaps](docs/CLIENT_HANDOFF.md)

## Stack
- Frontend: HTML, CSS, browser JavaScript
- Backend: Node.js, Express, Mongoose
- Authentication: bcrypt password hashing, JWT access tokens
- Database: MongoDB
- Deployment target: GitHub + Render

## Important
This is an MVP, not yet a production marketplace. It includes customer registration/login, restaurant onboarding and management, orders, delivery assignment, order status notifications, optional email/SMS alerts, opt-in delivery location sharing, ETA estimates, cancellation/help requests, and restaurant sales reports. Some external capabilities require provider credentials. Online and UPI choices are currently preferences only; checkout does not charge a customer. Authentication uses short-lived access tokens in sessionStorage; review the production checklist below before launch.

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

## Android app (PWA)
The customer website is installable on Android as a Progressive Web App. Deploy the `frontend` directory at the site root over HTTPS, open the site in Chrome on Android, then choose **Install app** (or Chrome menu → **Install app**). It starts at the customer home page; users can sign in to their existing customer, restaurant, staff, delivery, or admin account and are routed to their role's dashboard.

The installed app loads the same deployed frontend and uses the same API and MongoDB data as the website. Frontend changes appear after the app reconnects and reloads; orders and account data remain shared. The service worker uses network-first loading and does not cache API responses, so offline use is limited to the cached home screen and static shell. This PWA does not create a Play Store listing or a standalone APK.

## Payment behavior
Cash on delivery is the only checkout method currently collected by the app. Online and UPI QR choices are recorded as customer preferences; checkout does not start a payment, generate a QR code, or collect money. The repository has preliminary Razorpay controller code, but it is not mounted as API routes and the customer checkout does not call it. Do not present online payments as available until the routes, checkout flow, provider configuration, webhook, and end-to-end payment handling are completed and verified.

## Customer phone sign-in
Phone sign-in sends and checks SMS one-time passwords through Twilio Verify. Create a Verify Service, then configure these backend environment variables (keep the auth token private): `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_VERIFY_SERVICE_SID`. Phone sign-in is for active customer accounts and accepts Indian 10-digit numbers or E.164 numbers such as `+919876543210`. Password and Google sign-in remain available.

## Order alerts
In-app notifications are stored in MongoDB. Optional email alerts use Resend (`RESEND_API_KEY` and `EMAIL_FROM`); optional order SMS alerts use Twilio Messaging (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and either `TWILIO_MESSAGING_SERVICE_SID` or `TWILIO_FROM_NUMBER`). SMS delivery depends on Twilio account status, verified destinations in trial mode, and regional messaging rules. Copy `backend/.env.example` to `backend/.env` and keep provider credentials only in the backend environment. No SMS or email is sent until these values are configured.

## Restaurant hours and delivery areas
Restaurant owners can set weekly opening hours in India Standard Time and group delivery PIN codes under named neighbourhoods. Customers can search by area name or filter by PIN, and checkout/order requests are checked against the restaurant's hours and PIN coverage. Restaurants without a saved PIN list remain unrestricted until the owner configures one.

Owners and secondary admins can configure typical preparation and delivery times. Customers see an estimated delivery time; the estimate is reset when the restaurant marks the order ready. It is a restaurant-configured estimate, not a guaranteed arrival time.

The platform admin creates each restaurant's primary admin account (the owner). The primary admin can then create one account for each additional role: secondary admin, biller/modifier, and viewer, and can remove accounts to free a role for a replacement. Secondary admins can manage restaurant settings, menus, and orders. Biller/modifier accounts can manage menus and update order statuses. Viewers have read-only access.

## Ratings and reviews
Customers can submit one 1–5 star rating and an optional comment for each order after the restaurant marks it ready. Restaurant cards and menu pages show the average score, review count, and recent feedback; restaurant owners can read their reviews in the dashboard.

## Order tracking and saved addresses
Customer orders show a progress timeline and refresh automatically while the orders page is open. Orders progress through placed, preparing, ready for pickup, out for delivery, and delivery done. Restaurant staff manage the flow through out for delivery; only the assigned delivery person can mark delivery done. Delivery people can explicitly start GPS sharing from their dashboard; the customer sees the rider on a live map. Customers can separately opt in to share their GPS location with the assigned delivery person while the order is out for delivery. Precise customer coordinates are available only to that assigned delivery account and the customer, and are cleared when delivery is marked done. Location sharing requires HTTPS (or localhost) and browser permission. The maps use OpenStreetMap tiles and update as the pages refresh; they are not turn-by-turn navigation. Restaurant status changes, delivery, cancellation requests/reviews, and help requests/replies create in-app notifications for the relevant customer or restaurant team. Customers can save up to 10 delivery addresses and reorder from the current menu.

New delivery assignments appear in the delivery dashboard with Accept and Decline options. Accepted orders can be handed over by the restaurant for delivery; a declined offer is sent to another active delivery person. If everyone declines, the restaurant dashboard can retry assignment after another delivery account becomes active.

Restaurant owners and secondary admins can view a date-filtered sales report with paid delivered sales, daily activity, order statuses, and best-selling dishes. The report is based on orders in the selected range and excludes unpaid orders from revenue.

Customers can request cancellation before delivery and send an order-specific help request. Restaurant staff with order-management permission can approve or decline cancellation requests and reply to and resolve help requests. Paid orders cannot be cancelled from this workflow because a refund must be processed through the payment provider; the app does not currently issue refunds.

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
- `PATCH /api/restaurants/owner/service-settings` — owner updates opening hours and named delivery areas with PIN codes
- `GET /api/restaurants/owner/staff` — primary restaurant admin lists staff accounts
- `POST /api/restaurants/owner/staff` — primary restaurant admin creates a secondary admin, biller/modifier, or viewer login
- `DELETE /api/restaurants/owner/staff/:staffId` — primary restaurant admin removes a staff login
- `GET /api/reviews/restaurant/:id` — public restaurant rating and recent reviews
- `GET /api/reviews/restaurant/mine` — restaurant owner's reviews
- `POST /api/reviews` — customer reviews one of their ready orders
- `POST /api/orders` — authenticated customer creates an order (server calculates item prices)
- `GET /api/orders/mine` — authenticated customer lists their orders
- `PATCH /api/orders/:id/customer-location` — customer opts in to sharing their GPS location with the assigned delivery person during delivery
- `DELETE /api/orders/:id/customer-location` — customer stops sharing their location
- `GET /api/customer/addresses` — customer lists their saved delivery addresses
- `POST /api/customer/addresses` — customer saves a delivery address (up to 10)
- `DELETE /api/customer/addresses/:id` — customer deletes one of their saved addresses
- `GET /api/orders/restaurant` — authenticated restaurant owner lists its orders
- `PATCH /api/orders/restaurant/:id` — owner advances an order through allowed states
- `GET /api/orders/delivery/mine` — delivery person lists assigned orders and pickup/drop-off details
- `PATCH /api/orders/delivery/:id/assignment` — assigned delivery person accepts or declines an offer
- `PATCH /api/orders/delivery/:id` — assigned delivery person marks delivery done and records COD cash collection
- `PATCH /api/orders/restaurant/:id/reassign-delivery` — restaurant retries an unassigned delivery order
- `PATCH /api/orders/delivery/location` — delivery person shares coordinates to assigned active orders
- `GET /api/notifications/mine` — lists the signed-in user's in-app notifications
- `PATCH /api/notifications/mine/:id/read` — marks one of the signed-in user's notifications as read
- `PATCH /api/orders/:id/received` — customer confirms they received a delivered order
- `POST /api/orders/:id/cancellation-request` — customer requests cancellation before delivery; restaurant staff can approve or decline
- `POST /api/orders/:id/help` — customer sends an order issue to the restaurant
- `PATCH /api/orders/restaurant/:id/cancellation` — restaurant reviews a pending cancellation request
- `PATCH /api/orders/restaurant/:id/help/:requestId` — restaurant replies to and resolves a customer help request
- `GET /api/restaurants/owner/reports?from=YYYY-MM-DD&to=YYYY-MM-DD` — owner or secondary admin gets sales and order summaries
- `GET /api/admin/restaurants` — admin lists restaurants
- `POST /api/admin/restaurants` — admin creates a pending restaurant and owner login
- `POST /api/admin/delivery-partners` — admin creates an active delivery login
- `PATCH /api/admin/restaurants/:id/status` — admin approves, rejects, or suspends a restaurant

The existing owner menu routes are mounted under `/api/restaurants/owner/menu`.

## Local use
Run the API and serve the `frontend` directory with a static server. Set `FRONTEND_ORIGIN` to that server's origin. You need an approved restaurant and an active restaurant-owner user in MongoDB before it appears publicly. Public self-registration creates customer accounts only. Restaurant account provisioning and approval are still manual and must be done through a controlled process.

Order totals currently include menu item prices only; taxes and delivery fees are zero. Delivery assignment is account-based and uses restaurant/customer text addresses; there is no distance routing or dispatch optimization. Orders are rejected temporarily when no active delivery account exists; create one from the admin dashboard before accepting orders.

## Security baseline
- Keep real credentials in the deployment platform's secret manager or an ignored local `.env`; never put them in frontend files, screenshots, issue reports, or commits. `.env.example` must contain placeholders only.
- The `Secret scan` GitHub Actions workflow scans repository history on pushes and pull requests. It detects leaks after they reach GitHub; enable GitHub Secret Scanning and Push Protection in repository Settings to block supported secrets before a push is accepted.
- If a credential is ever committed or shared, revoke/rotate it immediately. Removing it from the latest file does not invalidate it or remove it from Git history.
- MongoDB filters are built from validated fields rather than client-supplied filter objects. API JSON/query input containing MongoDB operator keys (`$...`) or dotted field names is rejected before database work.
- This app currently uses MongoDB/Mongoose, so SQL injection does not apply to its current data layer. If SQL is added later, use parameterized queries and never build SQL strings from user input.
- Public registration cannot choose a role.
- Restaurant routes resolve the restaurant from the authenticated owner.
- Never trust prices or totals from the browser.
- The API limits request bodies and general request rates, with tighter limits on login, registration, Google sign-in, OTP, and password reset. The built-in rate-limit store is in-memory per Node process; use a shared store when running multiple instances so limits cannot reset or diverge across instances.
- Put the production API behind the hosting provider's DDoS protection and a web application firewall/CDN with request, connection, and bandwidth limits. Application middleware reduces abusive HTTP traffic but cannot absorb a large network flood by itself.
- Outbound email, SMS, and payment-provider calls have bounded timeouts. The standalone Node server also bounds slow HTTP requests; serverless hosting applies its own request timeout controls.
- Set `FRONTEND_ORIGIN`, `JWT_SECRET`, MongoDB credentials, and provider credentials in the deployment platform's secret manager. Never expose backend secrets in frontend files.
- Enable automated database backups/snapshots with the database host, set a retention period, and regularly test restoring a backup to a separate staging database. Protect exported backups because they contain customer and order data.
- Add end-to-end tests for checkout, restaurant status updates, delivery completion, cancellation/help, and payment webhooks before launch. The current automated suite is only a small smoke test.
- Use HTTPS in production. Delivery GPS sharing will not work on plain HTTP except localhost.
## Android APK for review

The Android app bundles the current `frontend` files and serves them from Android's secure local WebView origin. API requests go to the existing backend at `https://foodway-ten.vercel.app/api`, so accounts and order data are shared with the website. The backend allows the Android WebView's local origin for API requests.

### Build and download the APK

1. Push the repository changes to GitHub.
2. Open the repository’s **Actions** tab and select **Build Android APK**. A push to `frontend/` or `android/` starts a build automatically.
3. Open the completed run and download the `foodway-android-apk` artifact.
4. Extract the ZIP and install `app-debug.apk`. If Android refuses to update the earlier APK, uninstall that version first and install the new one.

Frontend changes are included in the next APK build, so install the new APK to update its screens. The app continues using the live backend data. This workflow creates a debug APK for client review; Play Store distribution requires a signed release build and protected signing key. The installable PWA described above is a separate option.

### Build from Android Studio

1. Install an Android Studio version compatible with Android Gradle Plugin `9.2.0` (Panda 4 / 2025.3.4 or newer) and select JDK 17 or newer for Gradle. Install Android SDK Platform 36 and Build Tools 36.0.0 in SDK Manager.
2. In Android Studio, choose **File → Open** and open the repository's `android` folder (not the repository root). Wait for Gradle sync to finish.
3. If prompted, set **Gradle JDK** under **File → Settings → Build, Execution, Deployment → Build Tools → Gradle** to the bundled JDK or another compatible JDK.
4. To install directly on a connected phone/emulator, choose the `app` run configuration and click **Run**. To create the APK, choose **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
5. After Android Studio reports the build succeeded, click **Locate** in its notification. The debug APK is `app/build/outputs/apk/debug/app-debug.apk`.

The Gradle build automatically synchronizes the latest `frontend/` files into the app assets before building. `android/local.properties` is machine-specific and ignored by Git; if Android Studio cannot find the SDK, open **Tools → SDK Manager** and set the Android SDK location for this computer.
