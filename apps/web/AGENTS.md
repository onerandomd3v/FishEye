# Web Agent Instructions — FishEye

Applies to all files under `apps/web/`. **Also follow the repository root [AGENTS.md](../../AGENTS.md)** and read [PRD.md](../../PRD.md), [BRAND.md](../../BRAND.md), and [DESIGN.md](../../DESIGN.md) before significant frontend work.

## Application boundaries

- `landing/`: **Astro** for the public, primarily static marketing website; use React islands only when genuine interactivity warrants them.
- `console/`: **Next.js App Router**, React and TypeScript for the authenticated analyst product. Use the Next.js server runtime; do **not** configure static export for the console.
- Shared primitives, typography and tokens belong under root `packages/ui/`; generated OpenAPI types/client belong under `packages/api-client/`.
- These are distinct deployables in **one monorepo**. Do not create nested Git repositories or turn the landing into an authenticated product.

## Next.js architecture

1. Prefer **Server Components** for layouts, authenticated initial data and noninteractive presentation.
2. Use **Client Components** for event handlers, investigation filters, tables, charts, form interactivity and live job status. Place `"use client"` at the smallest practical interactive boundary.
3. Request-time authentication/session handling must be validated **on the server**. Middleware/proxy is insufficient as the only authorization gate.
4. **FastAPI is the authoritative backend.** Next.js may coordinate secure server-side fetching and session handling, but it must not reimplement detection logic, severity computation, metrics, worker orchestration or domain persistence.
5. Use the **generated OpenAPI client** and stable API resource schemas. Avoid hand-copied contract types and browser-visible secrets.
6. Use TanStack Query for frequently refreshed client data where warranted; avoid unnecessary duplication between Server Component fetches and client caches. Ensure cache policy never leaks data across users or runs.
7. Use Next.js route segments, `loading.tsx`, `error.tsx`, not-found and error boundaries with accurate, accessible states. Never render fabricated successful run data.
8. Use server-side pagination/filtering for investigation tables and maintain query state in stable URLs where beneficial.

## FishEye identity and design

- **Inter only; white/light mode only; black/white and neutral grays only.** No purple, no dark mode, no colorful severity backgrounds.
- Use canonical SVG assets from root `assets/`; do not recreate the logo as independent shapes or paste an outdated lockup.
- Use semantic shared design tokens and UI components, not per-page arbitrary gray palettes. Follow `DESIGN.md` for responsive breakpoints, type scale, contrast and component state definitions.
- Preserve all information needed for investigations. Explicitly label `High`, `Medium` and `Low` instead of relying on color.
- Keep landing-page copy concise, verifiable and honest about the synthetic dataset and product maturity.
- Use semantic HTML, labeled controls, keyboard support, focus management, meaningful empty/loading/error/retry states and WCAG 2.2 AA targets.
- Review desktop and mobile layouts, 200% zoom, reduced-motion and high-contrast assistive settings.

## Product correctness

- The frontend **never** generates scores, severity tiers, confusion matrices or comparative success claims. It displays values from completed, versioned API/worker runs.
- Clearly distinguish synthetic evidence, model inference and human review outcomes.
- Do not claim real-bank deployment or “live monitoring” without evidence.
- A review can update analyst disposition; it cannot mutate event history or scores.
- All protected content must be checked by FastAPI authorization regardless of UI route protection.

## Before marking a web task complete

1. Verify affected routes and components against the FishEye Figma reference and `DESIGN.md`.
2. Exercise keyboard and accessible states, narrow viewport and meaningful empty/error behavior.
3. Run existing lint, TypeScript checks, tests and production builds for affected workspaces; do not invent scripts.
4. Confirm logos, Inter, grayscale tokens and request-time session behavior.
5. Report what passed, what could not be run, and any design or API gaps.

If a proposed feature requires a backend contract change, describe it and coordinate that contract rather than fabricating API data locally.
