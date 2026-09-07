// Componente-raiz da seção "Partes" do Studio (Studio -> Partes, issue #220).
// Master (esquerda) = lista de tipos de party definida em código (partyTypes.ts);
// Detail (direita) = PartyTypeDetail com 3 abas (Geral, Características Gerais, Especificações).
// Não usa o fluxo de draft/publish do Studio (o domínio 'parties' só tem o adapter no-op) —
// mutações persistem direto via API para quem tem permissão (canEdit = true).

import { useState } from 'react';
import { Search, Users } from 'lucide-react';
import { PARTY_TYPES, type PartyTypeDef } from './partyTypes';
import { PartyTypeDetail } from './PartyTypeDetail';

export type PartyModelStudioProps = {
  canEdit: boolean;
  canAdmin: boolean;
};

export function PartyModelStudio({ canEdit }: PartyModelStudioProps) {
  const [selectedKey, setSelectedKey] = useState<string>(PARTY_TYPES[0]?.key ?? '');
  const [filterText, setFilterText] = useState('');

  const selectedPartyType: PartyTypeDef | null =
    PARTY_TYPES.find((item) => item.key === selectedKey) ?? PARTY_TYPES[0] ?? null;

  const filteredTypes = PARTY_TYPES.filter((item) => {
    const term = filterText.toLowerCase().trim();
    if (!term) return true;
    return (
      item.label.toLowerCase().includes(term) ||
      item.description.toLowerCase().includes(term) ||
      item.roleName.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-4">
      {/* Top Bar */}
      <div className="vt-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-app-accent-soft text-app-text">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h3>Modelo de partes & papéis</h3>
            <p className="text-[0.78rem] text-app-muted">
              Organizações, indivíduos, papéis (TMF632/669) e características de catálogo por tipo de parte.
            </p>
          </div>
        </div>
      </div>

      {/* Master / Detail Grid */}
      <div className="grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
        {/* Left: Lista de Tipos de Party */}
        <div className="vt-card flex min-h-[580px] flex-col p-4">
          <div className="pb-3 border-b border-app-border mb-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-app-muted" />
              <input
                type="text"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder="Buscar tipo de parte..."
                className="w-full rounded-[10px] border border-app-border bg-white pl-8 pr-3 py-1.5 text-[0.82rem] text-app-text outline-none focus:border-app-accent"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 max-h-[640px]">
            {filteredTypes.length === 0 ? (
              <div className="p-8 text-center text-app-muted text-[0.84rem]">
                Nenhum tipo de parte encontrado.
              </div>
            ) : (
              filteredTypes.map((item) => {
                const isSelected = selectedPartyType?.key === item.key;
                return (
                  <div
                    key={item.key}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedKey(item.key)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedKey(item.key);
                      }
                    }}
                    className={`p-3 rounded-[10px] border transition cursor-pointer flex items-center justify-between gap-2 ${
                      isSelected
                        ? 'border-app-accent bg-app-accent-soft text-app-text font-semibold'
                        : 'border-app-border hover:bg-black/[0.02] text-app-text'
                    }`}
                  >
                    <div className="min-w-0">
                      <span className="truncate font-medium text-[0.88rem]">{item.label}</span>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[0.72rem] font-mono text-app-muted">{item.roleName}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Detalhe do Tipo de Party Selecionado */}
        <div className="min-w-0">
          {selectedPartyType ? (
            <PartyTypeDetail partyType={selectedPartyType} canMutate={canEdit} />
          ) : (
            <div className="flex min-h-[580px] flex-col items-center justify-center rounded-[10px] border border-dashed border-app-border p-12 text-center text-app-muted">
              <Users className="h-10 w-10 mb-3 opacity-30" />
              <h3 className="text-[1.1rem]">Nenhum tipo selecionado</h3>
              <p className="text-[0.85rem] mt-1 max-w-sm">
                Selecione um tipo de parte à esquerda para visualizar suas características e registros.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
