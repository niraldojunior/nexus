// Painel direito do Studio -> Partes: header + 3 tabs em segmented pill
// (mesmo padrão visual de ResourceNodeDetail.tsx): Geral | Características Gerais | Especificações.
// Diferente de ResourceNodeDetail, não depende de draft/publish (achado 4 do plano) — os controles
// de mutação ficam sempre visíveis para quem tem `canMutate`.

import { useState } from 'react';
import { Users } from 'lucide-react';
import type { PartyTypeDef } from './partyTypes';
import { PartyCharacteristicCatalogEditor } from './PartyCharacteristicCatalogEditor';
import { SupplierRecordsTab } from './SupplierRecordsTab';

export type PartyTypeDetailProps = {
  partyType: PartyTypeDef;
  canMutate: boolean;
};

type DetailTab = 'overview' | 'characteristics' | 'records';

export function PartyTypeDetail({ partyType, canMutate }: PartyTypeDetailProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');

  return (
    <div className="vt-card flex h-full flex-col overflow-hidden p-0">
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-sky-200 bg-sky-50 text-sky-600">
            <Users className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold leading-tight text-app-text truncate">{partyType.label}</h3>
            <p className="text-[0.78rem] text-app-muted leading-tight mt-0.5 truncate font-normal">
              {partyType.description}
            </p>
          </div>
        </div>

        {/* Tabs — segmented control pill */}
        <div className="mt-3.5 flex">
          <div className="inline-flex items-center rounded-xl bg-black/[0.04] p-1 gap-1">
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className={`rounded-lg px-3.5 py-1.5 text-[0.82rem] font-medium transition ${
                activeTab === 'overview'
                  ? 'bg-white text-app-text font-semibold shadow-sm'
                  : 'text-app-muted hover:text-app-text'
              }`}
            >
              Geral
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('characteristics')}
              className={`rounded-lg px-3.5 py-1.5 text-[0.82rem] font-medium transition ${
                activeTab === 'characteristics'
                  ? 'bg-white text-app-text font-semibold shadow-sm'
                  : 'text-app-muted hover:text-app-text'
              }`}
            >
              Características Gerais
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('records')}
              className={`rounded-lg px-3.5 py-1.5 text-[0.82rem] font-medium transition ${
                activeTab === 'records'
                  ? 'bg-white text-app-text font-semibold shadow-sm'
                  : 'text-app-muted hover:text-app-text'
              }`}
            >
              Especificações
            </button>
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div className="px-6 pb-6 pt-4 overflow-y-auto flex-1">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div>
              <h3
                className="mb-3"
                style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)' }}
              >
                Descrição
              </h3>
              <p className="text-[0.92rem] text-app-text leading-relaxed">
                {partyType.description}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div className="rounded-[10px] border border-app-border p-4">
                <span style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)' }}>
                  Rótulo
                </span>
                <p className="text-[0.95rem] font-medium text-app-text mt-1">{partyType.label}</p>
              </div>

              <div className="rounded-[10px] border border-app-border p-4">
                <span style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)' }}>
                  Papel (roleName)
                </span>
                <p className="text-[0.95rem] font-mono font-medium text-app-text mt-1">
                  {partyType.roleName}
                </p>
              </div>

              <div className="rounded-[10px] border border-app-border p-4">
                <span style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)' }}>
                  Chave
                </span>
                <p className="text-[0.95rem] font-mono font-medium text-app-text mt-1">
                  {partyType.key}
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'characteristics' && (
          <PartyCharacteristicCatalogEditor roleName={partyType.roleName} canMutate={canMutate} />
        )}

        {activeTab === 'records' && (
          <SupplierRecordsTab roleName={partyType.roleName} canMutate={canMutate} />
        )}
      </div>
    </div>
  );
}
