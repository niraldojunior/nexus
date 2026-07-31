# V.tal Nexus - UI Kit

Hi-fi, interactive recreation of **V.tal Nexus**, the next-generation Network Inventory product.

The current visual baseline is the Lab001 assistant/workspace language: light collapsible sidebar, central composer, white operational cards, V.tal yellow accent, soft shadows, and domain-first navigation.

## Screens

- **Assistente** - composer central e conversa operacional.
- **Geo** - mapa, lista, hierarquia, endereços, locations e catálogo.
- **Resource** - inventário físico/lógico e catálogo de resources.
- **Service** - CFS/RFS, SubscriberID e relações de serviço.
- **Order** - viabilidade, qualificação e fulfillment.

## Production Reference

- `web/src/App.tsx` - app React oficial, herdada/adaptada do Lab001.
- `web/src/components/Sidebar.tsx` - sidebar clara e colapsável.
- `web/src/components/Composer.tsx` - entrada conversacional central.
- `web/src/data/mockData.ts` - dados mockados de domínio Nexus.

## Notes

- Lab001 is now the visual reference for layout, spacing, shell behavior, composer, and assistant/workspace interaction.
- Icons: **Lucide React** in production; Lucide CDN remains acceptable for static design-system showcases.
- The older static JSX files in this folder are legacy visual references, not the production frontend.
