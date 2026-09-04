import { CheckCircle2, LockKeyhole, ServerCog } from 'lucide-react';

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
  return (
    <div>
      <div className="mb-5 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-app-accent-border bg-app-accent-soft text-app-text">
          <ServerCog className="h-5 w-5" strokeWidth={1.8} />
        </div>
        <div>
          <h1 className="font-display text-[1.5rem] font-semibold text-app-text">Ambiente</h1>
          <p className="mt-1 text-[0.88rem] leading-5 text-app-muted">
            Metadados operacionais allowlisted. Valores, segredos e conteúdo de arquivos de ambiente
            nunca são expostos pelo Nexus.
          </p>
        </div>
      </div>

      <div className="mb-4 flex items-start gap-2 rounded-[14px] border border-app-border bg-app-accent-soft px-3 py-3 text-[0.82rem] leading-5 text-app-text">
        <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.8} />
        <p>
          Esta visão é documental e não oferece leitura, edição ou cópia de valores de configuração.
        </p>
      </div>

      <div className="overflow-hidden rounded-[20px] border border-app-border bg-white shadow-soft">
        <table className="w-full min-w-[620px] text-left">
          <thead>
            <tr className="border-b border-app-border bg-slate-50 text-[0.82rem] font-semibold text-app-muted">
              <th className="px-5 py-3">Variável</th>
              <th className="px-5 py-3">Origem</th>
              <th className="px-5 py-3">Escopo</th>
              <th className="px-5 py-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {environmentMetadata.map((item) => (
              <tr key={item.name} className="border-b border-app-border text-[0.88rem] text-app-text last:border-0">
                <td className="px-5 py-3 font-mono text-[0.82rem] font-semibold">{item.name}</td>
                <td className="px-5 py-3 text-app-muted">{item.origin}</td>
                <td className="px-5 py-3 text-app-muted">{item.scope}</td>
                <td className="px-5 py-3">
                  <span className="inline-flex items-center gap-1.5 text-app-text">
                    <CheckCircle2 className="h-4 w-4" strokeWidth={1.8} />
                    {item.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
