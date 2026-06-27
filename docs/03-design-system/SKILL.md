---
name: vtal-nexus-design
description: Use this skill to generate well-branded interfaces and assets for V.tal Nexus (V.tal's next-generation Network Inventory product) and the wider V.tal brand, either for production or throwaway prototypes/mocks. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping telco / network-inventory interfaces.
user-invocable: true
---

Read the `readme.md` file within this skill, and explore the other available files (`tokens/`, `components/core/`, `ui_kits/nexus/`, `guidelines/`, `assets/`).

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view: link `styles.css` for tokens, load Lucide from CDN for icons, and reuse the component patterns. If working on production code, copy assets and read the rules here to become an expert in designing with the V.tal brand (Inter + Montserrat, V.tal Yellow `#FFD919` on a light-corporate surface system, soft shadows + golden glow, Lucide iconography).

Key facts to honor:
- Brand accent V.tal Yellow `#FFD919` is used sparingly (primary actions, active nav, focus glow, one hero KPI) — never as a flood fill. Pair it with ink `#181919`.
- Portuguese (Brazil), precise telco vocabulary, impersonal system voice, no emoji.
- Element classes are color-coded (OLT, splitter, CTO, pole, cable, site).

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.
