Primary action control — use for the main CTA on any view; reach for `secondary`/`ghost` for lower-emphasis actions and `danger` for destructive ones.

```jsx
import { Plus } from 'lucide-react';

<Button variant="primary" iconLeft={<Plus size={16} />}>
  Novo elemento
</Button>
```

Variants: `primary` (V.tal yellow on ink — one per view), `secondary` (neutral outline), `ghost` (toolbar/inline), `dark` (on light surfaces needing contrast), `danger`. Sizes `sm | md | lg`. Pass Lucide nodes to `iconLeft` / `iconRight`; set `fullWidth` inside forms.
