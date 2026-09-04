# V.tal Nexus — Design System

**V.tal Nexus** is V.tal's next-generation **Network Inventory** product — *Inteligência de rede de nova geração*. It consolidates and evolves V.tal's existing in-house solutions — **Geosite**, **Logradouros**, **Geonet** and **Viabilidade Fuzzy** — into a single best-in-class telco inventory, under a modular, **API-first**, **TM Forum**-standard architecture, dimensioned for V.tal's national scale and complexity.

This repository is a **design system**: brand foundations (color, type, spacing, effects), reusable React component primitives, foundation specimen cards, and a full interactive UI kit recreating the product. Consuming projects link `styles.css` and import components from the compiled bundle.

---

## Context — the V.tal holding

V.tal is Brazil's largest **neutral fiber network** operator. The holding spans three companies, all reachable from this brand family:

- **V.tal** — wholesale neutral fiber infrastructure — https://vtal.com.br/
- **Tecto** — data centers / digital infrastructure — https://tecto.com/
- **nio internet** — consumer ISP — https://www.niointernet.com.br/

V.tal Nexus sits inside this holding as the network-inventory backbone.

### Source material

- **GitHub — `niraldojunior/oraculo`** (https://github.com/niraldojunior/oraculo) — the authoritative source for the visual system. Oráculo is a tech-portfolio/governance web app (React 19 + Vite + Lucide), and its `frontend/src/index.css` explicitly defines the **V.tal Yellow (`#FFD919`)** brand accent, the light-corporate surface system, the dark sidebar, the Inter + Montserrat type pairing, the soft-shadow + golden-glow elevation, and the badge/button/table patterns lifted into this system. Explore that repo to go deeper on real product patterns (dashboards, data tables, modals, org charts).
  - The network-inventory *screens* in this system's UI kit are original to the V.tal Nexus product brief; only the foundations and component vocabulary come from Oráculo.

---

## Content fundamentals

**Language.** Portuguese (Brazil), product/enterprise register. Technical telco vocabulary is used precisely: *inventário, viabilidade, elemento de rede, OLT, CTO, splitter, caixa terminal, recurso, topologia, caminho óptico, homes passed*.

**Voice.** Confident, precise, infrastructural — not playful. The product positions itself as serious network intelligence ("Inteligência de rede de nova geração"). Sentences are short and declarative.

**Person.** Impersonal/system voice in the UI ("Endereço viável", "Avaliando rede no raio de atendimento…"). Addresses the operator by action, not "you/I". Buttons are imperative verbs: *Verificar viabilidade, Gerar ordem de serviço, Novo elemento, Exportar*.

**Casing.** Sentence case for titles and body. **UPPERCASE** only for eyebrow labels, table headers, and badges (with `+0.05em` tracking). Element IDs are uppercase mono (`CTO-4821`, `OLT-SP-CAS-014`).

**Numbers.** Brazilian formatting — `1.284.920`, `98,4%`, `4,7M`. KPIs are numbers-led and set in Montserrat extrabold.

**Standards as vocabulary.** TM Forum / TMF639 / SID, "API-first", and the four legacy module names (Geosite, Logradouros, Geonet, Viabilidade Fuzzy) appear as first-class terms and as badges.

**Emoji.** None. Status and meaning are carried by color, dots, and Lucide icons — never emoji.

---

## Visual foundations

**Overall vibe.** A quiet LLM-console surface, in the register of shadcn/ui: flat white canvas, near-white chrome, hairline borders, one restrained type family. Nothing lifts, glows, or drop-shadows without a reason. The chrome recedes so that the two things that carry meaning — the map and the brand yellow — are the only saturated elements on screen. Yellow marks state, never decorates: primary actions, the active nav pill, focus, selection, one hero KPI.

**No fixed top bar.** The content area runs from the sidebar to the right edge and from the yellow hairline to the bottom. Page titles live *inside* the scrolling content (`PageHead`: title + subtitle, no search bar or notification bell — those belong to a real top bar this system doesn't have), so they can be as tall as the page needs and scroll away as the user reads. Content padding is 20px (`--content-pad`) on the sides/bottom; the top padding is 8px so the page `<h1>` sits in a 48px box that lines up with the "Nexus" wordmark's box in the sidebar header — titles and the brand mark share one baseline.

**Chrome is light.** The dark sidebar is gone. Primary navigation is either a **72px icon rail** (`--rail-width`, Locais module — the map owns the canvas) or a **248px labeled sidebar** (`--sidebar-width`, Studio and conversational modules), both on `#FAFAFB` with a single hairline border. `Shell.jsx` composes it the way shadcn/ui composes its Sidebar — header (brand) / content (menu-button groups, a bare list for the primary + domain + system items, a labeled "Conversas recentes" group) / footer (account) / an edge rail the user can click to toggle icon-collapse — with only V.tal's colors swapped in: the active item is a yellow-washed pill (`--sidebar-item-active`), not a white-alpha tint. Collapsed (rail) items show their label as a small dark tooltip on hover, same as shadcn's `collapsible="icon"`. One dark surface remains, `--surface-ink` (`#2E2D39`): the login brand panel, dark buttons, the inverted hero KPI.

**Color.** The neutral ramp is derived from the V.tal brand grays (`#2E2D39` / `#514F66` / `#BCC1D6`) at very low chroma, so the greys read as V.tal rather than as generic Tailwind slate.
- *Brand accent* — V.tal Yellow `#FFD919` (hover `#FFE047`), paired with brand ink `#181919` for text on yellow. Opaque wash `--vt-yellow-tint` `#FEF7DC` for active nav and selected rows.
- *Surfaces* — canvas `#FFFFFF`, chrome/sidebar `#FAFAFB`, muted `#F5F5F8`, ink `#2E2D39`.
- *Borders* — hairline `#E8E8EE`, strong `#DADAE3`. **The border is what makes a card a card.**
- *Text* — primary `#2E2D39`, secondary `#514F66`, tertiary `#8A8899`, disabled `#BCC1D6`. Pure black is reserved for the logotype.
- *Status* — green `#10B981`, blue `#3B82F6`, amber `#F59E0B`, red `#EF4444`, purple `#8B5CF6`, each with a soft tinted fill for badges.
- *Map layers* (`--map-*`, Locais module) — disponível `#12805C`, suspenso `#E8615C`, parcial `#F0A32E`, estação `#7C5CE0`, selecionado `#FFD919`, cobertura `#C08A2A` @ 35%. Markers are the one place saturated color is allowed to shout, because they sit on the Google basemap. Legend ramp `--map-ramp` runs suspenso → disponível.
- *Network taxonomy* — element classes are color-coded (OLT blue, splitter purple, CTO green, pole amber, cable slate, site yellow).

**Type.** Product UI is **single-family: Inter**, headings included — `h1`/`h2`/`h3` are Inter **semibold (600)** at `-0.01em`, not Montserrat extrabold. **Montserrat** survives only on `--text-display`: the brand hero, the login headline, and big KPI numbers. **JetBrains Mono** for IDs, coordinates, codes, and API payloads. Scale is rem against a 16px root: body 14px (`--fs-body-lg`), 15px with `--lh-relaxed` for reading and chat columns (`--text-prose`, capped at `--prose-max`), 13px for dense tables, 12px labels, 11px eyebrows.

**Spacing.** 4px base grid (4·8·12·16·24·32·48·64). Card padding lives on 16–24. Generous gaps between sections (24), tighter within cards.

**Backgrounds.** Flat surfaces — no gradients on content. The only decorative texture is a subtle dotted yellow grid on the login brand panel (very low opacity). No imagery, no full-bleed photos, no hand-drawn illustration. A 3px yellow hairline runs along the very top of the app frame — the one persistent brand mark in the chrome.

**Elevation.** Flat by default: cards, panels, and rows carry **no shadow at all** — structure comes from the 1px border. Shadow is spent only on things that genuinely float: `--shadow-md` dropdowns and tooltips, `--shadow-lg` popovers and menus, `--shadow-float` the map's search pill and floating panels, `--shadow-xl` dialogs. `--shadow-gold` is now a 3px focus ring, not a glow, and is never a hover state.

**Borders & radii.** 10px base. Chips/badges `radius-sm 6px`, buttons/inputs/nav items `radius-md 8px`, cards/panels `radius-lg 10px`, popovers `radius-xl 14px`, floating map panels `radius-2xl 18px`, search pill and legend `radius-full`. Cards are white with a 1px hairline border **and no shadow** — border, not both.

**Animation.** Restrained and short. Standard ease `cubic-bezier(0.4,0,0.2,1)`; `120ms` for hovers and state swaps, `180ms` for panel and sidebar transitions. Nothing translates on hover. Remaining motifs: a radar **pulse** ring on live status dots, the switch knob sliding, a spinner for async viability checks. No lift, no bounce, no parallax, no decorative loops.

**Hover / press.** Hover is a background and border shift, nothing more: cards go to `--surface-card-hover` + `--border-strong`; buttons swap fill; nav items and table rows take `--surface-muted`. Active nav is ink text on the `--sidebar-item-active` yellow wash. Focus on buttons/controls draws `--focus-shadow`, a 3px yellow ring, via `:focus-visible` — but the composer and search bar (`.vt-composer`, `.vt-searchbar`) opt out of the yellow ring on their inner input and use a soft neutral shadow on the container instead (`0 4px 16px rgba(46,45,57,.10)`); a double yellow outline read as noisy on a text field the user is about to type into.

**Transparency & blur.** Sparse. White dropdowns and modals over a dark scrim; sidebar uses white-alpha tints for nav states. No heavy glassmorphism on content.

**Cards.** White, `radius-lg (10px)`, 1px `--border`, no shadow. `elevation="raised"` and `"float"` opt into shadow when the surface really floats. Interactive cards shift background + border on hover. KPI cards may invert to `--surface-ink` with a yellow icon chip for a single hero metric.

**Tables.** Heads are sentence-case `--text-label` in `--text-tertiary` — not uppercase micro-caps. Rows are separated by hairlines and hover to `--surface-muted`. No zebra striping, no vertical rules.

**Locais module chrome.** The map is the page; everything else floats over it, inset by `--float-gap` (16px). The vocabulary: a `.vt-searchbar` pill top-left, a `.vt-float-panel` for entity detail and the Layers stack, `.vt-map-btn` for single map controls, the legend ramp bottom-center, and `MapMarker` badges on the basemap. Entity sub-navigation uses `IconTabs` — round icon buttons that fill solid yellow when active. Layer toggles use `Switch`. Key/value detail rows use `.vt-kv`.

---

## Iconography

- **System: [Lucide](https://lucide.dev)** — the same icon set Oráculo uses (`lucide-react` in the codebase). Outline style, 2px stroke, 16–24px in product UI.
- In these static HTML artifacts Lucide is loaded from CDN (`unpkg.com/lucide`) and bridged into React via the `Icon` helper in `ui_kits/nexus/shared.jsx` (renders `<i data-lucide="…">` then `lucide.createIcons()`). In production React, use `lucide-react` directly: `import { Server } from 'lucide-react'`.
- **Element-class icons** map network types to glyphs: OLT → `server`, Splitter → `split`, CTO → `box`, Poste → `utility-pole`, Cabo → `cable`, Site → `radio-tower`.
- **No emoji, no unicode-glyph icons.** Status uses colored dots + Lucide marks. The few non-icon SVGs in this system are the logo lockups in `assets/`.

---

## Logo & brand assets

`assets/` holds:
- **Nexus symbol** — `nexus-mark.svg` (ink + gold, light bg), `nexus-mark-white.svg` (dark bg), `nexus-mark-solid.svg` (one-color, for the yellow chip / favicon). The mark is a **cube-hub inside a connection diamond**: the cube is the inventory hub, the diamond is the network mesh, and the four vertices are network nodes — one in V·tal gold marks the active node.
- **Official V·tal logo** — `vtal-logo.png` (black wordmark + yellow dot) and `vtal-logo-white.png` (recolored for dark surfaces).

**Lockup:** assemble inline as `[Nexus mark] · [V·tal logo] · | · Nexus` — reads as the product name *V·tal Nexus* (parent endorsement + product). See `guidelines/brand-logo.card.html`, the UI-kit sidebar (`Shell.jsx`) and login (`Login.jsx`) for the canonical assembly. App icons sit on black (`#141516`), V·tal yellow, or white.

The full logo exploration and rationale live in `Nexus Logo C.html` (chosen direction) — earlier rounds in `Nexus Logo.html`, `Nexus Logo v2.html`, `Nexus Logo v3.html`.

---

## Index / manifest

**Foundations**
- `styles.css` — root entry point (`@import` list only).
- `tokens/fonts.css` · `colors.css` · `typography.css` · `spacing.css` · `effects.css` · `base.css` — all design tokens + base element styles.
- `guidelines/*.card.html` — foundation specimen cards (Colors, Type, Spacing, Effects, Brand) shown on the Design System tab.

**Components** (`components/core/`) — `Button`, `Badge`, `StatusPill`, `Input`, `Switch`, `Card`, `MetricCard`, `IconTabs`, `MapMarker`. Each has `.jsx` + `.d.ts`; the set is showcased in `core.card.html`, the conversational chrome in `chat.card.html`, and the Locais chrome (icon rail, floating panels, layer toggles, markers, legend) in `geo.card.html`.

**UI kit** (`ui_kits/nexus/`) — full interactive V.tal Nexus product: login, dashboard, inventory, viability, topology, the Assistant module (`Assistant.jsx` — Nova Conversa, Conversas history, transcript thread), and Locais (`Locais.jsx` — map, layers, entity detail). `Shell.jsx` is the shadcn-composed app shell all of them mount into. See its `README.md`.

**Assets** (`assets/`) — logo lockups + app mark.

**Skill** — `SKILL.md` makes this system usable as a downloadable Claude skill.

> Components are consumed via `const { Button } = window.VTalNexusDesignSystem_63587b` after loading `_ds_bundle.js` (auto-generated). Never edit `_ds_bundle.js`, `_ds_manifest.json`, or `_adherence.oxlintrc.json`.
