# FishEye — Brand Guidelines

> **Version:** 1.0 · **Status:** Source of truth for visual and verbal identity · **Updated:** 2026-10-21  
> **Applies to:** landing, analyst console, documentation, research reports, exports and presentations.  
> **Companion:** [DESIGN.md](./DESIGN.md) for component-level frontend rules; [PRD.md](./PRD.md) for product claims.

## 1. Brand foundation

**Name:** FishEye (capital F and E; one word).  
**Descriptor:** Context-aware insider-risk triage.  
**Product idea:** *See the signal. Ignore the noise.*  
**Purpose:** Help analysts evaluate unusual employee access more accurately by combining contextual signals instead of equating every anomaly with malicious intent.

**Brand character:** observant, precise, restrained, credible, evidence-led, calm. Not sinister, theatrical, militaristic or playful.

### Positioning and proof

FishEye is an explainable, synthetic-data-first software MVP. Position it as a serious foundation for future security analysis, **not** as a bank-certified protection product. Never claim an improvement in false-positive detection without linking it to a measured, versioned experiment and its limitations. Never imply real bank/employee access or association with Zenith Bank.

### Audience and tone

- **Analysts:** precise, plainspoken, actionable and appropriately cautious.
- **Security leaders:** explain value through measured alert burden, recall and review effort, not hype.
- **Technical evaluators:** disclose methods, synthetic scenario assumptions and failure cases.
- **Public visitors:** explain the problem simply; invite exploration without unsupported performance promises.

Use concise, active sentences and avoid sensational language. **Prefer** “Review unusual access with context” over “Catch dangerous employees instantly.” Use **finding**, **priority**, **event**, **evidence**, **scenario**, **synthetic dataset**, and **evaluation run** correctly. Never call a risk score proof of misconduct.

## 2. Logo architecture

FishEye has three distinct official treatments:

| Asset | File | Usage |
| --- | --- | --- |
| Brand **mark** | [assets/fisheye-mark.svg](../assets/fisheye-mark.svg) | Favicon, avatar, compact navigation, app icon |
| **Wordmark** | [assets/fisheye-wordmark.svg](../assets/fisheye-wordmark.svg) | Text-first headers, document cover, where brand symbol is separately present |
| **Combined logo** | [assets/fisheye-logo.svg](../assets/fisheye-logo.svg) | Preferred header, landing-page hero/footer, sign-in and external communications |

**Composition:** The mark references a deep-sea anglerfish, whose illuminated lure symbolizes noticing valuable signals in darkness. The large eye conveys careful observation. The logo **does not depict literal surveillance capability**.

**Optical alignment:** The combined mark is aligned against the **main fish/eye body**, not the lure tip. The lure intentionally extends above the text's visual center. Do not independently re-center SVG pieces or use the old combined lockup. The corrected asset is canonical.

**Brand typography:** Inter. The wordmark uses an Inter-style heavy treatment; where SVG text is used, ensure the runtime has Inter available. For critical cross-platform brand reproduction, produce approved outlined-path exports from the canonical wordmark with typography reviewed; do **not** substitute an unverified fallback silently.

**Minimum use:** These are initial implementation constraints, subject to review on device. Combined logo visual height ≥ 24 px in digital UI; mark ≥ 20 px. At small sizes, prefer the standalone mark and remove decorative halo detail if necessary, without changing the fish silhouette.

**Clear space:** Maintain at least the height of the fish pupil as empty space on each side of the logo. Keep it clear of navigation text, dividers, borders and adjacent icons. A mark-only icon inside a button may follow component padding rules instead.

**Allowed:** Official monochrome assets on white or off-white, proportional scaling, transparent background. If a white-on-black logo is required in a document, prepare and review a dedicated white monochrome variant; do not apply a CSS inversion that damages the bulb/eye transparency.

**Never:** Stretch, skew, rotate, crop the lure, apply colored glows, add gradients/shadows to the silhouette, replace Inter, reorder symbol/text, redraw the symbol, combine with unrelated security icons or place logo on a noisy texture.

## 3. Palette: black, white, neutral gray only

The product is strictly **light-only**. This applies to public marketing, console and charts. The palette has **no purple, blue/green/red brand accents, dark-mode alternative, tinted backgrounds or colorful status badges**.

| Brand role | Token | Hex | Typical use |
| --- | --- | --- | --- |
| Primary ink | `ink` | `#111111` | Headings, key text, primary actions |
| White | `white` | `#FFFFFF` | Page and card surfaces |
| Subtle surface | `surface-muted` | `#F7F7F7` | Sidebar, selected row, gentle panels |
| Soft border | `border` | `#D7D7D7` | Dividers, inputs, cards |
| Secondary ink | `text-secondary` | `#595959` | Labels and supporting copy |
| Quiet ink | `text-subtle` | `#666666` | Low-priority but readable metadata |
| Inverse ink | `text-inverse` | `#FFFFFF` | Text on primary ink |

Use semantic tokens in code, not ad-hoc nearby grays. Gray values above are *FishEye choices*, not values mandated by cited design standards. See [DESIGN.md](./DESIGN.md) for implementation-level token names, contrast constraints and component states.

**Accessibility is not optional:** For normal-size text, target WCAG 2.2 AA ≥ 4.5:1; large text ≥ 3:1; interactive controls need visible focus. Avoid using very pale gray for information users must read. Check actual contrast pairs before release. Light-only does not justify disabling browser zoom, user high-contrast settings or assistive technologies.

## 4. Typography

One family across all surfaces: **Inter**.

- Headlines: Bold (700), confident but never shouty.
- Section titles: Semibold (600).
- Body: Regular (400), with comfortable line-height.
- Navigation/actions: Medium (500) or Semibold (600).
- Numeric metrics: Inter with **tabular numerals** where relevant.
- Small metadata: 12–13 px minimum where possible, avoid tiny low-contrast legal or risk text.
- Distinguish real measurements and examples in copy and labeling, not by color.

No decorative typefaces, letterspacing-heavy all-caps paragraphs, hand-drawn fonts or gradient text.

## 5. Brand usage across surfaces

- **Landing:** combined mark + wordmark in the masthead; concise problem statement, credible supporting statements, one primary CTA and an optional secondary link.
- **Console sidebar:** the official mark (or combined logo if it fits), aligned consistently. Navigation must remain readable, not dominated by branding.
- **Sign-in:** combined logo and brief context. Never suggest that login itself accesses real bank systems.
- **Reports/research exports:** logo, document title, dataset/run version and synthetic-data caveat.
- **Charts:** black/gray lines, patterns, stroke styles, markers and direct labels; never rely on hue alone.
- **Favicon/small avatar:** mark only with adequate padding; review it at 16, 24 and 32 px.

## 6. Voice and microcopy rules

**Do:**
- “Three findings need review.”
- “Flagged because device and access volume differ from this account's baseline.”
- “Synthetic evaluation; not validated on real banking activity.”
- “This score suggests investigation priority, not malicious intent.”

**Don't:**
- “Three malicious employees detected.”
- “Guaranteed insider threat prevention.”
- “Bank-grade AI catches everything.”
- “64% fewer false positives” without citing the actual FishEye test conditions and source run.

Sentence case for navigation and buttons. Make buttons verb-oriented: “Run evaluation”, “View evidence”, “Record review”. Error messages should explain what happened and how to recover without exposing secrets.

## 7. Asset governance

- The canonical SVGs live in `assets/`; do not duplicate hand-maintained logos under each web app.
- Raster PNGs are **exports** of the SVGs, not alternate sources of truth. Use identical geometry, centered transparent canvases and exact variant naming.
- Web consumers may reference the shared assets through approved build/public-copy scripts; do not use remote editable design URLs as runtime assets.
- Any logo change requires preview at header, sidebar, sign-in, document and favicon sizes, plus monochrome and contrast review.
- Coordinate design changes with [DESIGN.md](./DESIGN.md), shared UI tokens and Figma.

## 8. Governance and review checklist

Every brand change must satisfy:

- [ ] Spelling/capitalization is **FishEye**.
- [ ] Correct official asset used; no old unbalanced lockup.
- [ ] Inter throughout; no fallback regression in browser.
- [ ] Black/white/grayscale only; light mode only.
- [ ] Logo maintains ratio, padding, and visual balance.
- [ ] Claims and metrics are traceable or explicitly labelled hypothetical/synthetic.
- [ ] Text and controls pass applicable accessibility testing.
- [ ] Landing, sidebar, sign-in and exports remain visually consistent.

**Decision boundary:** This document is for brand identity. [DESIGN.md](./DESIGN.md) defines operational frontend behavior, components and layouts; [AGENTS.md](../AGENTS.md) tells coding agents how to implement and verify both.

## 9. Reference foundations (not FishEye ownership claims)

- [IBM Carbon — Design System overview](https://www.carbondesignsystem.com/getting-started/designing/overview): separates brand design language, foundations, components and patterns.
- [USWDS — Design Tokens](https://designsystem.digital.gov/design-tokens/): limited, repeatable type/spacing/color values.
- [W3C WCAG 2.2 — Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html): text contrast criteria.

FishEye's colors, tone and specific logo rules are **project design decisions** informed by, not copied from, these references.
