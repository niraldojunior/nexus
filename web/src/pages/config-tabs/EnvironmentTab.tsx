import { useMemo } from 'react';
import { CheckCircle2, LockKeyhole } from 'lucide-react';
import PageHead from '../../components/ui/PageHead';
import DataTable, { type DataTableColumn } from '../../components/ui/DataTable';

type EnvironmentMetadata = {
  name: string;
  origin: string;
  scope: string;
  status: string;
};

// Catálogo estritamente allowlisted: nenhuma chave sensível nem valor de ambiente é serializado
// para o browser. A inspeção operacional de segredo continua fora do Nexus.
const environmentMetadata: EnvironmentMetadata[] = [
  { name: 'DATABASE_PROVIDER', origin: 'Processo', scope: 'Backend', status: 'Configurada' },
  { name: 'TMF_PUBLIC_BASE_URL', origin: 'Processo', scope: 'API pública', status: 'Opcional' },
  { name: 'AUTH_ENABLED', origin: 'Processo', scope: 'Autenticação', status: 'Configurada' },
  { name: 'AUTH_ACCESS_TOKEN_TTL_HOURS', origin: 'Processo', scope: 'Autenticação', status: 'Configurada' },
  { name: 'LOG_LEVEL', origin: 'Processo', scope: 'Observabilidade', status: 'Configurada' },
];

export function EnvironmentTab() {
  const columns: DataTableColumn<EnvironmentMetadata>[] = useMemo(
    () => [
      {
        key: 'name',
        header: 'Variável',
        render: (item) => (
          <span className="font-mono text-[0.82rem] font-semibold" style={{ color: 'var(--text-primary)' }}>
            {item.name}
          </span>
        ),
      },
      {
        key: 'origin',
        header: 'Origem',
        render: (item) => (
          <span style={{ color: 'var(--text-secondary)' }}>{item.origin}</span>
        ),
      },
      {
        key: 'scope',
        header: 'Escopo',
        render: (item) => (
          <span style={{ color: 'var(--text-secondary)' }}>{item.scope}</span>
        ),
      },
      {
        key: 'status',
        header: 'Estado',
        render: (item) => (
          <span className="inline-flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
            <CheckCircle2 className="h-4 w-4" strokeWidth={1.8} />
            {item.status}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <div>
      <PageHead
        title="Ambiente"
        subtitle="Metadados operacionais allowlisted. Valores, segredos e conteúdo de arquivos de ambiente nunca são expostos pelo Nexus."
      />

      <div className="mb-4 flex items-start gap-2 rounded-[14px] border border-app-border bg-app-accent-soft px-3 py-3 text-[0.82rem] leading-5 text-app-text">
        <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.8} />
        <p>
          Esta visão é documental e não oferece leitura, edição ou cópia de valores de configuração.
        </p>
      </div>

      <DataTable
        columns={columns}
        rows={environmentMetadata}
        rowKey={(item) => item.name}
      />
    </div>
  );
}
