# Food Platform Design Guide

This guide records the visual language in the current frontend CSS and the UX principles to preserve as pages evolve. Existing pages may contain legacy variations; align them gradually instead of breaking role workflows in a broad restyle.

## Brand direction

- **Character:** welcoming neighborhood food, clear and practical service, friendly rather than overly formal.
- **Primary accent:** warm tomato/coral red for customer-facing highlights and calls to action.
- **Operations accent:** orange for admin, restaurant, and delivery dashboard actions.
- **Surfaces:** warm near-white backgrounds, white cards, light beige borders, and dark warm text.
- Use food imagery where available; avoid decorative visuals that push menu, address, status, or payment information out of view.

## Current CSS palette

| Token | Current value | Use |
| --- | --- | --- |
| Ink | `#25231f` / `#29251f` | Primary text and headings. |
| Page background | `#fffaf5` | Warm operations page background; customer pages may use white. |
| Accent coral | `#e83d55` | Customer primary actions, logo mark, selected states, and prominent links. |
| Dashboard orange | `#ea580c` | Operations actions and emphasis. |
| Deep orange | `#c2410c` | Hover state and dashboard branding. |
| Body muted | `#75685f` / `#857c74` | Supporting descriptions and metadata. |
| Border | `#efe4da` / `#e8e1dc` | Cards, inputs, separators, and controls. |
| Success | `#32804d` / `#386641` | Open, complete, and positive status feedback. |
| Error | `#b42318` | Validation and request errors. |

## Typography

- Current shared font stack: `Inter`, system UI, platform sans-serif, then Segoe UI.
- Use a clear heading hierarchy and short section labels; avoid using color alone to express meaning.
- Use comfortable body line-height and readable sizes on mobile. Keep numeric data (₹ totals, PIN codes, phone numbers, timestamps) easy to scan.

## Layout and components

- Use a centered content width for browsing and dashboard content; allow forms to expand into responsive grids on desktop and stack on small screens.
- Cards use white surfaces, subtle warm borders, rounded corners (about 12–16px), and restrained shadows.
- Inputs and selects should have consistent heights, spacing, borders, labels, and clear focus styling.
- Primary buttons use high-contrast filled color, visible hover/focus states, and comfortable touch targets. Secondary actions use neutral surfaces.
- Keep customer storefront navigation and role dashboard navigation distinct. Role dashboards should prioritize task queues, status, and actions relevant to that role.
- Use status chips with both text and color (for example “Preparing”, “Ready”, “Delivered”).
- Filter controls should be grouped once per task area; avoid duplicated controls that perform the same filtering.

## Responsive behavior

- Start with mobile-safe widths and allow grids to collapse to one column at narrow breakpoints.
- Avoid fixed-width forms, horizontal page overflow, and tiny controls. Long tables/cards should wrap or scroll within a clearly bounded region.
- Keep checkout totals and the main action visible and understandable on small screens.
- Verify navigation, maps, order timelines, dialogs, and account forms at narrow and wide viewport sizes.

## Accessibility and interaction

- Use semantic elements and explicit labels; preserve keyboard navigation and visible `:focus-visible` indicators.
- Pair every loading, empty, error, and success visual with concise text. Announce asynchronous status using appropriate live regions.
- Ensure text/control contrast and touch targets remain usable; honor reduced-motion preferences for nonessential animation.
- Do not use hover as the only way to expose an action. Confirm destructive or irreversible actions with clear context.

## Implementation notes

- Shared styles live in `frontend/assets/css/style.css`; inspect page-level styles before adding a new token or override.
- Prefer CSS custom properties when consolidating tokens, but avoid a large-scale selector rewrite without checking all role dashboards.
- Keep the PWA and website on the same visual/component source to reduce drift.

## Related documents

- [Product requirements](prd.md)
- [Architecture](architect.md)
- [Project phases](phases.md)
