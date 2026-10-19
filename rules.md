# Project Rules for AI and Contributors

These are project-specific working conventions for the Food Platform repository. Follow higher-priority platform, security, and repository instructions first.

## Before changing code

- Read `prd.md` for product behavior, `architect.md` for the current system design, and this file for project conventions.
- Inspect the relevant page, route, controller, model, and existing styles before editing. Prefer a focused change that fits current patterns.
- Treat the current source code as the implementation truth. If documentation and code differ, verify the behavior and update the relevant documentation.
- Do not add a new library or framework for a small feature. Discuss the need in the change summary when a dependency is necessary.

## Stack and structure

- Frontend: static HTML, CSS, and browser JavaScript in `frontend/`.
- Backend: Node.js 20+, Express, Mongoose, and MongoDB in `backend/`.
- Keep HTTP route declarations in `backend/src/routes/`, request/business handling in controllers or shared services, schemas in `backend/src/models/`, and reusable access checks in middleware/utilities.
- Keep the customer website and Android PWA pointed at the same API. Do not duplicate business rules in a separate client implementation.

## Security and data integrity

- Never commit secrets, real customer data, access tokens, or populated `.env` files. Keep credentials server-side.
- Validate request data at the API boundary, reject unknown or invalid fields, and return safe errors without leaking stack traces, secrets, or provider responses.
- Enforce authentication, role, ownership, and assignment checks on every protected API operation. Hiding a frontend button is not authorization.
- Compute prices and totals from trusted database records on the server. Do not trust client-supplied prices, payment status, role, restaurant identity, or delivery completion.
- Restrict customer location access to the customer and assigned delivery partner for the active delivery; stop/clear sharing when delivery ends.
- Verify payment signatures and webhook events server-side. Never store card numbers or CVV.
- Preserve HTTPS-only production origins and explicit CORS allowlists.

## UX and accessibility

- Keep the interface responsive across mobile and desktop layouts.
- Use semantic HTML, associated labels, keyboard-accessible controls, visible focus states, and status/error messages that assistive technology can discover.
- Reuse existing design tokens and shared CSS before introducing one-off styles. Keep role-specific dashboards separate from the customer storefront.
- Make loading, empty, success, and error states explicit; avoid silent failures.

## Data and compatibility

- Maintain compatibility between the static frontend, API, MongoDB records, and installed PWA. Changes that affect persisted data must consider existing documents and deployment migration needs.
- Keep order status transitions and payment status separate, and retain the server-side permission boundaries documented in `architect.md`.
- Update `prd.md`, `architect.md`, `phases.md`, and `memory.md` when product scope, system structure, phase completion, or project state materially changes.
- Keep the README setup and deployment guidance aligned with actual code and environment variables.

## Verification and delivery

- For code changes, use the narrowest relevant existing checks, and report the exact checks run and any that could not run.
- Do not claim an external deployment, GitHub push, or provider configuration succeeded unless it was confirmed.
- Keep commits focused and explain behavior changes and operational limitations in plain language.
