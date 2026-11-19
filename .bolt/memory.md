# Project memory

## Product intent & audience

- Personal inventory management web app for tracking collectible/trading cards
- Core card fields: image, name, quantity, target quantity, location, condition, price, status
- Input form + persistent data list view; fast quantity adjustments and inventory status overview

## Brand personality & voice

- Utility-focused, practical tool for personal card tracking
- UI labels in Chinese (e.g., 多 X / 缺 X / 已满足, 多余/缺少/瑕疵)

## Visual design & UX direction

- Card-based grid: 3 cards per row on desktop, 2 per row on mobile
- Top stats bar with filters: 多余 (excess), 缺少 (short), 瑕疵 (defective); tap to filter, tap again to reset
- Inline +/- buttons per card for quick quantity changes (min 0, auto-save)
- Target quantity default 1; cards show surplus/shortfall/satisfied status badge
- Production-quality, non-cookie-cutter aesthetic expected per global instructions

## Decisions, constraints & rationale

- Stack: Vite + React + JSX + Tailwind CSS + Lucide React icons (no extra UI packages)
- Import modules via `@/` alias → `src/`
- Phase 1 complete and responsive; three plan questions answered with defaults (adjustable later)
- Quantity floor enforced at 0

## Open questions & assumptions

- Three plan questions remain unresolved but handled with defaults; specifics not recorded
- Not yet implemented: screenshot/image input optimization, theme-based set viewing, "已约定互换" (agreed-swap) status, search by name
- Assumption: card data persists (mechanism TBD/confirmed later)