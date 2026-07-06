---
name: vtal-nexus-design
description: Use this skill to generate well-branded interfaces and assets for V.tal Nexus (V.tal's next-generation Network Inventory product) and the wider V.tal brand, either for production or throwaway prototypes/mocks. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping telco / network-inventory interfaces.
user-invocable: true
---

Read the `readme.md` file within this skill, and explore the other available files (`tokens/`, `components/core/`, `ui_kits/nexus/`, `guidelines/`, `assets/`).

**Before generating any output, confirm with the user whether the deliverable is (a) a throwaway visual artifact or (b) production-ready code, unless the user's request makes this unambiguous. Default to (a) if unclear.**

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), produce a self-contained static HTML file: inline critical CSS tokens, load Lucide icons from CDN (https://unpkg.com/lucide@latest), and embed or reference only publicly accessible assets. Do not assume local file paths are resolvable by the user. If working on production code, use the React/Tailwind frontend in `web/src` as the canonical product UI reference.

Key facts to honor:

- The current Nexus frontend uses the Lab001 assistant/workspace style: light collapsible sidebar, central composer, white cards, large radii, soft shadows, and operational domain pages.
- Brand accent V.tal Yellow `#FFD200` is used sparingly (primary actions, active nav, focus glow, one hero KPI) and never as a flood fill. Pair it with workspace ink `#243041`.
- Portuguese (Brazil), precise telco vocabulary. Use an impersonal system voice inside all generated UI copy, labels, and documentation. When conversing directly with the user to gather requirements, adopt a professional but direct designer tone in Brazilian Portuguese. No emoji.
- Main navigation domains are Assistente, Geo, Resource, Service, and Order.
- Geo screens must preserve TMF673/674/675 semantics: Site references Address and Location; it does not embed them.
- Element classes are color-coded (OLT, splitter, CTO, pole, cable, site).
  - Element class colors: OLT `#FF6B35`, splitter `#004E89`, CTO `#1A9E7D`, pole `#8B7500`, cable `#5A5A5A`, site `#9B59B6`. Always use these exact values; do not substitute or interpolate.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask focused questions, and act as an expert designer who outputs HTML artifacts or production code depending on the need.
