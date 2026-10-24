import { Fragment } from 'react';
import type { DraftAddress } from '../../utils/googleMaps';
import type { GeoTreeNode } from '../../services/geoTreeApi';
import type { StudioGeoCatalog } from '../../services/studioGeoApi';
import {
  operationalIconFactsForTreeNode,
  resolveOperationalIcon,
  visualIdentityForTreeNode,
} from '../../utils/pointIconPreview';

// Conteúdo do balão flutuante de preview, ancorado no item sob o mouse (árvore
// ou mapa). É montado no GeoPage e apenas desenhado pelo painel do mapa — assim
// o painel não precisa saber o que é Local e o que é Recurso. É um cartão de
// visita somente-leitura: o clique (não o hover) é que abre o detalhe completo.
export type MapBalloon = {
  // Id do nó da árvore (`site:<id>` | `resource:<id>`): identifica o alvo e
  // detecta a troca de item.
  key: string;
  point: [number, number];
  // Deslocamento em px do bico do balão em relação à coordenada, para o balão
  // pousar acima do ícone em vez de cobri-lo.
  offset: [number, number];
  iconUrl: string;
  eyebrow: string;
  title: string;
  rows: Array<[string, string]>;
};

// Conteúdo do balão de preview: identidade do item (tipo + nome + ícone) e os
// campos que o identificam em campo. Puro cartão de visita, sem ação — o
// detalhe completo mora no painel aberto por clique (ver GeoDetailPanel).
export function MapBalloonCard({ balloon }: { balloon: MapBalloon }) {
  return (
    <div className="w-[240px] p-1">
      <div className="flex items-start gap-2.5">
        <img src={balloon.iconUrl} alt="" className="mt-0.5 h-8 w-8 shrink-0" />
        <div className="min-w-0">
          <div className="text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-app-muted">
            {balloon.eyebrow}
          </div>
          <h3 className="font-display text-[1rem] font-semibold leading-tight text-app-text">
            {balloon.title}
          </h3>
        </div>
      </div>

      {balloon.rows.length ? (
        <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-app-border pt-2.5">
          {balloon.rows.map(([label, value]) => (
            <Fragment key={label}>
              <dt className="text-[0.72rem] text-app-muted">{label}</dt>
              {/* Sem `truncate`: substatus/modelo/endereço podem ser longos e devem
                  quebrar em mais de uma linha em vez de virar "…". */}
              <dd className="break-words text-[0.78rem] leading-snug text-app-text">{value}</dd>
            </Fragment>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

// Sem chave do Google Maps não há mapa: resta desenhar os mesmos nós em grade,
// para a navegação continuar utilizável em ambiente sem a chave configurada.
export function FallbackMap({
  nodes,
  catalog,
  draftAddress,
  onSelectNode,
}: {
  nodes: GeoTreeNode[];
  catalog: StudioGeoCatalog;
  draftAddress: DraftAddress | null;
  onSelectNode: (node: GeoTreeNode) => void;
}) {
  return (
    <div className="absolute inset-0 h-full w-full bg-[linear-gradient(rgba(215,222,232,0.72)_1px,transparent_1px),linear-gradient(90deg,rgba(215,222,232,0.72)_1px,transparent_1px),linear-gradient(135deg,#dce4ec,#f8fafc_46%,#e7eaf0)] bg-[length:36px_36px,36px_36px,auto]">
      <div className="absolute right-4 top-20 z-20 rounded-[18px] border border-app-border bg-white px-4 py-3 text-[0.84rem] text-app-muted shadow-soft">
        Configure <strong className="text-app-text">VITE_GOOGLE_MAPS_API_KEY</strong> para ativar
        Google Maps.
      </div>
      {nodes.slice(0, 60).map((node, index) => {
        const facts = operationalIconFactsForTreeNode(node);
        if (!facts) return null;
        const icon = resolveOperationalIcon(facts, visualIdentityForTreeNode(node, catalog), {
          size: 40,
        });
        return (
          <button
            key={node.id}
            type="button"
            onClick={() => onSelectNode(node)}
            title={`${node.label} · ${icon.label}`}
            className="absolute z-20 h-10 w-10 shadow-soft"
            style={{
              left: `${20 + (index % 6) * 10}%`,
              top: `${30 + (index % 4) * 12}%`,
            }}
          >
            <img src={icon.url} alt={node.label} className="h-10 w-10" />
          </button>
        );
      })}
      {draftAddress ? (
        <div className="absolute left-[54%] top-[52%] z-20 flex h-10 w-10 items-center justify-center rounded-[14px] border-2 border-app-text bg-app-accent font-bold shadow-soft">
          +
        </div>
      ) : null}
    </div>
  );
}
