import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Download, Loader2, Upload, X } from 'lucide-react';
import { createParty, createPartyRole, type Party } from '../services/partyApi';
import {
  bulkCreateResourceSpecifications,
  type ResourceCategory,
  type ResourceLayer,
  type ResourceSpecification,
  type ResourceSpecificationBulkResult,
  type ResourceType,
} from '../services/resourceApi';
import { downloadTextFile, parseCsv, toCsv } from '../utils/csv';
import {
  RESOURCE_SPEC_IMPORT_COLUMNS,
  buildResourceSpecificationTemplateCsv,
  parseResourceSpecificationImport,
  type ResourceSpecImportRow,
} from '../utils/resourceSpecificationImport';
import { buildResourceSpecificationPayload } from '../utils/resourceSpecificationForm';

// Papel usado para o fabricante — mesmo nome usado pelo cadastro de Fornecedores em Configurações
// (ver SUPPLIER_ROLE_NAME em ConfigurationPage.tsx) e pelo lookup do combo "Fabricante"
// (loadAllManufacturerOptions em src/shared/http/app.ts).
const MANUFACTURER_ROLE_NAME = 'manufacturer';

type RowOutcome = {
  line: number;
  cells: string[];
  status: 'created' | 'error';
  message?: string;
};

type ImportState =
  | { phase: 'idle' }
  | { phase: 'previewed'; rows: ResourceSpecImportRow[]; headerErrors: string[] }
  | { phase: 'importing'; rows: ResourceSpecImportRow[] }
  | {
      phase: 'done';
      rows: ResourceSpecImportRow[];
      outcomes: RowOutcome[];
      manufacturersCreated: number;
      serverResult: ResourceSpecificationBulkResult;
    };

export default function ResourceSpecificationBulkImportModal({
  categories,
  resourceTypes,
  resourceLayers,
  manufacturerOptions,
  existingSpecs,
  onClose,
  onImported,
}: {
  categories: ResourceCategory[];
  resourceTypes: ResourceType[];
  resourceLayers: ResourceLayer[];
  manufacturerOptions: Party[];
  existingSpecs: ResourceSpecification[];
  onClose: () => void;
  onImported: () => void;
}) {
  const [state, setState] = useState<ImportState>({ phase: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const downloadTemplate = () => {
    const csvRows = buildResourceSpecificationTemplateCsv(categories, resourceTypes, resourceLayers);
    downloadTextFile('modelo-catalogo-recursos-rede.csv', toCsv(csvRows));
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(null);
    try {
      const text = await file.text();
      const csvRows = parseCsv(text);
      const { headerErrors, rows } = parseResourceSpecificationImport(csvRows, {
        categories,
        resourceTypes,
        resourceLayers,
        existingSpecs,
      });
      setState({ phase: 'previewed', rows, headerErrors });
    } catch {
      setError('Não foi possível ler o arquivo. Confirme que é um CSV válido.');
    }
  };

  const validRows =
    state.phase === 'previewed' ? state.rows.filter((row) => row.errors.length === 0) : [];
  const invalidRows =
    state.phase === 'previewed' ? state.rows.filter((row) => row.errors.length > 0) : [];

  const runImport = async () => {
    if (state.phase !== 'previewed' || validRows.length === 0) return;
    setState({ phase: 'importing', rows: state.rows });
    setError(null);
    try {
      // Resolve fabricantes ainda não cadastrados — criados automaticamente (Organization +
      // PartyRole manufacturer), mesmo padrão do cadastro individual de Fornecedores.
      const knownByName = new Map(
        manufacturerOptions.map((party) => [party.name.trim().toLowerCase(), party] as const),
      );
      let manufacturersCreated = 0;
      const namesNeeded = [
        ...new Set(validRows.map((row) => row.manufacturerName).filter(Boolean)),
      ];
      for (const name of namesNeeded) {
        const key = name.trim().toLowerCase();
        if (knownByName.has(key)) continue;
        const party = await createParty({ name: name.trim(), partyType: 'Organization' });
        await createPartyRole({ partyId: party.id, name: MANUFACTURER_ROLE_NAME });
        knownByName.set(key, party);
        manufacturersCreated += 1;
      }

      const manufacturerOptionsWithNew = [...manufacturerOptions, ...knownByName.values()];
      const items = validRows.map((row) => {
        const manufacturerPartyId = row.manufacturerName
          ? (knownByName.get(row.manufacturerName.trim().toLowerCase())?.id ?? '')
          : '';
        const payload = buildResourceSpecificationPayload(
          { ...row.formState, manufacturerPartyId },
          null,
          manufacturerOptionsWithNew,
        );
        return { line: row.line, input: payload };
      });

      const serverResult = await bulkCreateResourceSpecifications(items);
      const resultByLine = new Map(
        serverResult.results.map((result) => [result.line, result] as const),
      );

      const outcomes: RowOutcome[] = state.rows.map((row) => {
        if (row.errors.length > 0) {
          return {
            line: row.line,
            cells: row.cells,
            status: 'error',
            message: row.errors.join('; '),
          };
        }
        const result = resultByLine.get(row.line);
        if (result?.status === 'created') {
          return { line: row.line, cells: row.cells, status: 'created' };
        }
        return {
          line: row.line,
          cells: row.cells,
          status: 'error',
          message: result?.message ?? 'Falha ao criar especificação.',
        };
      });

      setState({ phase: 'done', rows: state.rows, outcomes, manufacturersCreated, serverResult });
      if (serverResult.created > 0) onImported();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao importar o arquivo.');
      setState({ phase: 'previewed', rows: state.rows, headerErrors: [] });
    }
  };

  const downloadRejected = () => {
    if (state.phase !== 'done') return;
    const rejected = state.outcomes.filter((outcome) => outcome.status === 'error');
    if (rejected.length === 0) return;
    const header = [...RESOURCE_SPEC_IMPORT_COLUMNS.map((column) => column.header), 'Erro'];
    const dataRows = rejected.map((outcome) => [...outcome.cells, outcome.message ?? '']);
    downloadTextFile('linhas-rejeitadas.csv', toCsv([header, ...dataRows]));
  };

  const saving = state.phase === 'importing';

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-5">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="resource-spec-bulk-import-title"
        className="max-h-[92vh] w-full max-w-[900px] overflow-auto rounded-[28px] border border-app-border bg-white p-6 shadow-modal"
      >
        <div className="mb-5 flex items-start justify-between gap-4 border-b border-app-border pb-4">
          <div>
            <div className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-app-muted">
              Catálogo de Recursos de Rede
            </div>
            <h2
              id="resource-spec-bulk-import-title"
              className="mt-1 font-display text-[1.45rem] font-semibold text-app-text"
            >
              Carga em massa
            </h2>
          </div>
          <button
            type="button"
            className="rounded-full p-2 text-app-muted hover:bg-app-accent-soft"
            onClick={onClose}
            disabled={saving}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error ? (
          <p className="mb-4 rounded-[10px] bg-status-red-soft px-3 py-2 text-[0.82rem] text-status-red">
            {error}
          </p>
        ) : null}

        <div className="grid gap-6">
          <section className="grid gap-3">
            <div className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-app-muted">
              1. Modelo
            </div>
            <p className="text-[0.88rem] text-app-muted">
              Baixe o modelo de planilha com as colunas aceitas. Categoria e Tipo do Recurso são
              obrigatórios e precisam bater com o catálogo ativo; Modelo é obrigatório.
            </p>
            <button
              type="button"
              onClick={downloadTemplate}
              className="geo-btn secondary w-fit"
              disabled={saving}
            >
              <Download className="h-4 w-4" />
              Baixar modelo CSV
            </button>
          </section>

          <section className="grid gap-3">
            <div className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-app-muted">
              2. Arquivo
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => void handleFileChange(event)}
              disabled={saving}
              className="text-[0.88rem] text-app-text"
            />

            {state.phase === 'previewed' && state.headerErrors.length > 0 ? (
              <div className="rounded-[18px] border border-status-red/30 bg-status-red-soft px-4 py-3 text-[0.88rem] text-status-red">
                {state.headerErrors.map((message) => (
                  <div key={message}>{message}</div>
                ))}
              </div>
            ) : null}

            {(state.phase === 'previewed' || state.phase === 'importing') &&
            state.rows.length > 0 ? (
              <>
                <div className="flex items-center gap-4 rounded-[18px] border border-app-border bg-app-accent-soft px-4 py-3 text-[0.88rem] text-app-text">
                  <span>{state.rows.length} linha(s) no arquivo</span>
                  <span className="text-status-green">
                    {validRows.length || (state.phase === 'importing' ? state.rows.length : 0)}{' '}
                    pronta(s)
                  </span>
                  {invalidRows.length > 0 ? (
                    <span className="text-status-red">{invalidRows.length} com erro</span>
                  ) : null}
                </div>

                {invalidRows.length > 0 && state.phase === 'previewed' ? (
                  <div className="max-h-52 overflow-auto rounded-[18px] border border-app-border">
                    <table className="w-full min-w-[560px] text-left text-[0.82rem]">
                      <thead>
                        <tr className="border-b border-app-border bg-slate-50 text-app-muted">
                          <th className="px-3 py-2">Linha</th>
                          <th className="px-3 py-2">Modelo</th>
                          <th className="px-3 py-2">Motivo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invalidRows.map((row) => (
                          <tr key={row.line} className="border-b border-app-border last:border-0">
                            <td className="px-3 py-2 text-app-muted">{row.line}</td>
                            <td className="px-3 py-2 text-app-text">
                              {row.formState.model || '-'}
                            </td>
                            <td className="px-3 py-2 text-status-red">{row.errors.join('; ')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </>
            ) : null}
          </section>

          <section className="grid gap-3">
            <div className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-app-muted">
              3. Importação
            </div>

            {state.phase === 'previewed' || state.phase === 'importing' ? (
              <button
                type="button"
                onClick={() => void runImport()}
                disabled={saving || validRows.length === 0}
                className="geo-btn primary w-fit disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Importando...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    Importar {validRows.length} linha{validRows.length === 1 ? '' : 's'}
                  </>
                )}
              </button>
            ) : null}

            {state.phase === 'done' ? (
              <div className="grid gap-3">
                <div className="flex flex-wrap items-center gap-4 rounded-[18px] border border-app-border bg-app-accent-soft px-4 py-3 text-[0.88rem] text-app-text">
                  <span className="flex items-center gap-1.5 text-status-green">
                    <CheckCircle2 className="h-4 w-4" />
                    {state.outcomes.filter((outcome) => outcome.status === 'created').length}{' '}
                    criada(s)
                  </span>
                  {state.outcomes.some((outcome) => outcome.status === 'error') ? (
                    <span className="flex items-center gap-1.5 text-status-red">
                      <AlertTriangle className="h-4 w-4" />
                      {state.outcomes.filter((outcome) => outcome.status === 'error').length} com
                      falha
                    </span>
                  ) : null}
                  {state.manufacturersCreated > 0 ? (
                    <span>{state.manufacturersCreated} fabricante(s) criado(s)</span>
                  ) : null}
                </div>

                <div className="max-h-64 overflow-auto rounded-[18px] border border-app-border">
                  <table className="w-full min-w-[560px] text-left text-[0.82rem]">
                    <thead>
                      <tr className="border-b border-app-border bg-slate-50 text-app-muted">
                        <th className="px-3 py-2">Linha</th>
                        <th className="px-3 py-2">Modelo</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Detalhe</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.outcomes.map((outcome) => (
                        <tr key={outcome.line} className="border-b border-app-border last:border-0">
                          <td className="px-3 py-2 text-app-muted">{outcome.line}</td>
                          <td className="px-3 py-2 text-app-text">
                            {state.rows.find((row) => row.line === outcome.line)?.formState.model ||
                              '-'}
                          </td>
                          <td
                            className={`px-3 py-2 font-semibold ${
                              outcome.status === 'created' ? 'text-status-green' : 'text-status-red'
                            }`}
                          >
                            {outcome.status === 'created' ? 'Criada' : 'Falhou'}
                          </td>
                          <td className="px-3 py-2 text-app-muted">{outcome.message ?? '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {state.outcomes.some((outcome) => outcome.status === 'error') ? (
                  <button
                    type="button"
                    onClick={downloadRejected}
                    className="geo-btn secondary w-fit"
                  >
                    <Download className="h-4 w-4" />
                    Baixar linhas rejeitadas
                  </button>
                ) : null}
              </div>
            ) : null}
          </section>
        </div>

        <div className="mt-6 flex justify-end gap-3 border-t border-app-border pt-4">
          <button type="button" onClick={onClose} disabled={saving} className="geo-btn secondary">
            Fechar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
