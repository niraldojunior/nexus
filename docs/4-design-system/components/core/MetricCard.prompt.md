KPI tile for dashboards — eyebrow label, large Montserrat figure, optional delta and Lucide icon.

```jsx
import { Network } from 'lucide-react';

<MetricCard label="Homes Passed" value="1.28M" delta="2.4%"
  icon={<Network size={16} />} />
<MetricCard label="Taxa de viabilidade" value="98.4" unit="%" accent />
```

Set `accent` for one hero KPI per row (dark ink fill, yellow icon). `deltaDir="down"` turns the delta red.
