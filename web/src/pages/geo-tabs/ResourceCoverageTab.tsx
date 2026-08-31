import { Layers3, Loader2, MapPinned } from 'lucide-react';
import { useResourceCoverage } from '../../hooks/useResourceCoverage';

export type ResourceCoverageTabProps = {
  resourceId: string;
};

const areaLabel: Record<'neighborhood' | 'city' | 'uf', string> = {
  neighborhood: 'Bairro',
  city: 'Município',
  uf: 'UF',
};

const percentage = (ratio: number): string => `${Math.round(ratio * 100)}%`;

export function ResourceCoverageTab({ resourceId }: ResourceCoverageTabProps) {
  const { coverage, loading, error } = useResourceCoverage(resourceId, true);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-[18px] border border-dashed border-app-border p-4 text-[0.88rem] text-app-muted">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
        Consultando cobertura…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-[18px] border border-dashed border-status-red/30 bg-status-red-soft p-4 text-[0.84rem] text-status-red">
        {error}
      </div>
    );
  }

  if (!coverage) {
    return (
      <div className="rounded-[18px] border border-dashed border-app-border p-4 text-[0.88rem] text-app-muted">
        Este recurso não possui uma geometria pontual disponível para consultar a cobertura.
      </div>
    );
  }

  const unavailable = coverage.cell ? coverage.cell.cdoTotal - coverage.cell.cdoAvailable : 0;

  return (
    <div className="grid gap-4">
      <section className="grid gap-3 rounded-[18px] border border-app-border p-3">
        <div className="flex items-center gap-2 text-[0.78rem] font-semibold uppercase tracking-[0.06em] text-app-muted">
          <Layers3 className="h-3.5 w-3.5 shrink-0" />
          Célula de cobertura
        </div>
        {coverage.cell ? (
          <div className="grid grid-cols-2 gap-2 text-[0.82rem]">
            <Metric label="Grade" value={`${coverage.cell.sizeMeters} m`} />
            <Metric
              label="Disponibilidade"
              value={percentage(coverage.cell.cdoAvailable / Math.max(coverage.cell.cdoTotal, 1))}
            />
            <Metric label="CDOs totais" value={String(coverage.cell.cdoTotal)} />
            <Metric
              label="CDOs disponíveis"
              value={String(coverage.cell.cdoAvailable)}
              tone="text-status-green"
            />
            <Metric label="CDOs indisponíveis" value={String(unavailable)} />
          </div>
        ) : (
          <p className="text-[0.84rem] leading-relaxed text-app-muted">
            O ponto deste recurso não pertence a uma célula da grade de cobertura gerada.
          </p>
        )}
      </section>

      <section className="grid gap-3">
        <div className="flex items-center gap-2 text-[0.78rem] font-semibold uppercase tracking-[0.06em] text-app-muted">
          <MapPinned className="h-3.5 w-3.5 shrink-0" />
          Áreas que contêm o recurso
        </div>
        {coverage.areas.length ? (
          <div className="grid gap-2">
            {coverage.areas.map((area) => (
              <article
                key={area.id}
                className="grid gap-2 rounded-[14px] border border-app-border px-3 py-2.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[0.84rem] font-semibold text-app-text">
                      {areaLabel[area.level]}
                    </p>
                    <p className="break-words text-[0.8rem] text-app-text [overflow-wrap:anywhere]">
                      {area.level === 'neighborhood'
                        ? area.neighborhood
                        : area.level === 'city'
                          ? area.city
                          : area.uf}
                    </p>
                    {area.level === 'neighborhood' ? (
                      <p className="text-[0.74rem] text-app-muted">
                        {area.city} · {area.uf}
                      </p>
                    ) : area.level === 'city' ? (
                      <p className="text-[0.74rem] text-app-muted">{area.uf}</p>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-[0.82rem] font-semibold text-status-green">
                    {percentage(area.availabilityRatio)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[0.75rem] text-app-muted">
                  <span>CDOs: {area.cdoTotal}</span>
                  <span>Disponíveis: {area.cdoAvailable}</span>
                  <span>Área: {area.coveredAreaKm2.toFixed(2)} km²</span>
                  {area.portsTotal !== null && area.portsUsed !== null ? (
                    <span>
                      Portas: {area.portsUsed}/{area.portsTotal}
                    </span>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-[18px] border border-dashed border-app-border p-4 text-[0.88rem] text-app-muted">
            Nenhuma área de cobertura indexada contém este recurso.
          </div>
        )}
      </section>
    </div>
  );
}

type MetricProps = {
  label: string;
  value: string;
  tone?: string;
};

function Metric({ label, value, tone = 'text-app-text' }: MetricProps) {
  return (
    <div className="rounded-[12px] bg-app-accent-soft px-2.5 py-2">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.05em] text-app-muted">
        {label}
      </p>
      <p className={`mt-0.5 text-[0.9rem] font-semibold ${tone}`}>{value}</p>
    </div>
  );
}
