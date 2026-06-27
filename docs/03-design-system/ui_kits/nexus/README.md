# V.tal Nexus — UI Kit

Hi-fi, interactive recreation of **V.tal Nexus**, the next-generation Network Inventory product. Built entirely from the design-system primitives (`Button`, `Badge`, `StatusPill`, `Input`, `Card`, `MetricCard`) plus Lucide icons.

## Screens
- **Login** (`Login.jsx`) — split brand/form, V.tal yellow CTA, SSO note.
- **Visão Geral** (`Dashboard.jsx`) — KPI row, consolidated domains (Geosite / Logradouros / Geonet / Viabilidade Fuzzy), network activity feed, port-saturation bars.
- **Inventário** (`Inventory.jsx`) — TMF639 resource table with type filter, status pills, occupancy bars, element-class color coding.
- **Viabilidade** (`Viability.jsx`) — fuzzy address feasibility check with animated result (viável / parcial / inviável).
- **Topologia** (`Topology.jsx`) — end-to-end optical path (OLT → splitter → CTO → client), optical metrics, element detail panel, TM Forum API card.

## Structure
- `index.html` — orchestrator: login → app shell, screen routing, top-bar search/notifications.
- `Shell.jsx` — dark sidebar + contextual header.
- `data.js` — mock network data (not production).
- `shared.jsx` — `Icon` (Lucide bridge) + `ELEMENT_META` (type → color/icon).

## Notes
- This is a **visual recreation** themed to the V.tal Nexus product brief. The source repo (`niraldojunior/oraculo`) is a tech-portfolio tool; its design tokens, components, and Lucide iconography were lifted, but the network-inventory screens are original to this kit per the product description.
- Icons: **Lucide** (CDN). Element classes are color-coded via the network taxonomy tokens.
