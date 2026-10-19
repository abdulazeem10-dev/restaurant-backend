# Project Memory

This file is a concise handoff for future coding sessions. Update it when meaningful implementation or release work changes the current state. Do not put credentials, customer personal data, or private tokens here.

## Project

Food Platform is a multi-restaurant ordering MVP. Website and Android installable PWA share one static frontend, Node/Express API, and MongoDB database. See [prd.md](prd.md) and [architect.md](architect.md) for the full scope and technical structure.

## Current implementation snapshot

- Frontend is static HTML/CSS/browser JavaScript under `frontend/`, with separate customer, platform admin, restaurant, and delivery areas.
- Backend uses Node.js/Express/Mongoose and MongoDB under `backend/`.
- Roles include customer, restaurant primary admin/staff, delivery partner, and platform admin. Restaurant staff roles are secondary admin, biller/modifier, and viewer.
- Customer discovery, food-type filters, menu availability, cart/checkout, saved addresses/reorder, order timeline, support/cancellation, and reviews are implemented.
- Restaurant settings, staff account creation, menu/order management, hours, delivery PIN areas, reviews, and reports are implemented.
- Delivery dashboard supports accept/decline, assignment details, location sharing, map links, and delivery completion. Only the assigned partner can complete delivery.
- In-app notifications and periodic refresh are implemented. Email/SMS are optional providers.
- Razorpay checkout and webhook verification are implemented behind credentials; UPI QR remains a preference with no generated QR.
- Android experience is currently an installable PWA sharing the same backend and data; offline API use is not supported.

## Recent repository work

- Added product and architecture documentation (`prd.md`, `architect.md`) and README links in commit `350f9d6` (`Add product and architecture docs`).
- Prior UI cleanup commit `1801eec` (`Remove duplicate food type filter`).
- These commits were local when last checked. A GitHub push attempt failed because Git Credential Manager could not start in the Codex environment. Confirm `git status` and remote tracking before assuming they are published.

## Current known gaps

- Production readiness is incomplete: critical workflow regression tests, audit trails, monitoring/alerting, backup/restore rehearsal, privacy retention decisions, and incident/payment operations need attention.
- Location/status refresh is polling, not websocket push; maps are not turn-by-turn navigation.
- Payment credentials and optional messaging providers are environment-specific and must be configured in the hosting environment.
- Check current source before using this summary; implementation may have changed since this memory was written.

## Working conventions

- Follow [rules.md](rules.md); use [phases.md](phases.md) for sequencing and [design.md](design.md) for the current visual language.
- Never write secrets or real customer data into repo docs.
- Update this file after substantial changes with the commit/hash if available, updated feature state, verification performed, and remaining work.
