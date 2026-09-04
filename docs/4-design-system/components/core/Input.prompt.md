Labelled text field with optional leading icon; focus draws the signature golden ring.

```jsx
import { Search } from 'lucide-react';

<Input label="Endereço" iconLeft={<Search size={16} />}
  placeholder="Rua, número, CEP…" />
```

Pass `hint` for helper text, `iconLeft` for a Lucide glyph, `type` for password/email/number.
