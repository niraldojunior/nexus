import { Building2, FolderTree, Map } from 'lucide-react';
import type { GeoTreeNode } from '../../services/geoTreeApi';
import {
  operationalIconFactsForTreeNode,
  resolveOperationalIcon,
} from '../../utils/pointIconPreview';

export function NodeIcon({ node }: { node: GeoTreeNode }) {
  const facts = operationalIconFactsForTreeNode(node);
  if (facts) {
    const icon = resolveOperationalIcon(facts, undefined, { size: 20, context: 'glyph' });
    return <img src={icon.url} alt="" className="h-5 w-5 shrink-0" />;
  }
  const Icon = node.kind === 'uf' ? Map : node.kind === 'city' ? Building2 : FolderTree;
  return <Icon className="h-4 w-4 shrink-0 text-app-muted" />;
}
