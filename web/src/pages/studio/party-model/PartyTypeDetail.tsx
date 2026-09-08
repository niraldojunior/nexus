import { useEffect, useState, type FormEvent } from 'react';
import { AlertCircle, Check, Save, Trash2, Users } from 'lucide-react';
import { Button } from '../../../components/ui';
import {
  deactivatePartyRoleType,
  updatePartyRoleType,
  type PartyRoleType,
  type PartyRoleTypeInput,
} from '../../../services/partyRoleTypeApi';
import { PartyCharacteristicCatalogEditor } from './PartyCharacteristicCatalogEditor';
import { SupplierRecordsTab } from './SupplierRecordsTab';

export type PartyTypeDetailProps = {
  partyType: PartyRoleType;
  canMutate: boolean;
  onUpdated: (partyType: PartyRoleType) => void;
  onDeactivated: (id: string) => void;
};

type DetailTab = 'overview' | 'characteristics' | 'records';

const toDraft = (partyType: PartyRoleType): PartyRoleTypeInput => ({
  key: partyType.key,
  roleName: partyType.roleName,
  label: partyType.label,
  description: partyType.description ?? '',
});

export function PartyTypeDetail({ partyType, canMutate, onUpdated, onDeactivated }: PartyTypeDetailProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [draft, setDraft] = useState<PartyRoleTypeInput>(() => toDraft(partyType));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setActiveTab('overview');
    setDraft(toDraft(partyType));
    setError(null);
    setSuccess(false);
  }, [partyType]);

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const updated = await updatePartyRoleType(partyType.id, {
        key: draft.key.trim(),
        roleName: draft.roleName.trim(),
        label: draft.label.trim(),
        description: draft.description?.trim() || null,
      });
      onUpdated(updated);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2500);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível salvar o tipo de parte.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async () => {
    if (!window.confirm(`Inativar ${partyType.label}? Os registros existentes serão preservados.`)) return;
    setSaving(true);
    setError(null);
    try {
      await deactivatePartyRoleType(partyType.id);
      onDeactivated(partyType.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível inativar o tipo de parte.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="vt-card flex h-full flex-col overflow-hidden p-0">
      <div className="px-4 pb-3 pt-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-sky-200 bg-sky-50 text-sky-600">
              <Users className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="truncate font-bold leading-tight text-app-text">{partyType.label}</h3>
              <p className="mt-0.5 truncate text-[0.78rem] font-normal leading-tight text-app-muted">{partyType.description}</p>
            </div>
          </div>
          {canMutate && (
            <Button variant="danger" size="sm" iconLeft={<Trash2 className="h-4 w-4" />} onClick={() => void handleDeactivate()} disabled={saving}>
              Inativar
            </Button>
          )}
        </div>

        <div className="mt-3.5 flex">
          <div className="inline-flex items-center gap-1 rounded-xl bg-black/[0.04] p-1">
            {([
              ['overview', 'Geral'],
              ['characteristics', 'Características'],
              ['records', 'Especificações'],
            ] as const).map(([tab, label]) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`rounded-lg px-3.5 py-1.5 text-[0.82rem] font-medium transition ${activeTab === tab ? 'bg-white font-semibold text-app-text shadow-sm' : 'text-app-muted hover:text-app-text'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6 pt-4">
        {activeTab === 'overview' && (
          <form onSubmit={(event) => void handleSave(event)} className="space-y-5">
            {error && <div className="flex items-center gap-2 rounded-[10px] bg-status-red-soft p-3 text-[0.84rem] text-status-red"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
            {success && <div className="flex items-center gap-2 rounded-[10px] border border-emerald-200 bg-emerald-50 p-3 text-[0.84rem] text-emerald-800"><Check className="h-4 w-4 text-emerald-600" />Alterações salvas com sucesso.</div>}
            {canMutate ? (
              <>
                <div className="flex items-center justify-between border-b border-app-border pb-2">
                  <span className="text-[0.78rem] text-app-muted">Altere os dados de modelagem deste tipo de parte.</span>
                  <Button type="submit" variant="primary" size="sm" iconLeft={<Save className="h-4 w-4" />} disabled={saving}>
                    {saving ? 'Salvando…' : 'Salvar alterações'}
                  </Button>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-[0.8rem] font-semibold text-app-text">Título *<input value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} className="mt-1.5 w-full rounded-[10px] border border-app-border bg-white px-3 py-2 text-[0.88rem] font-normal outline-none focus:border-app-accent" /></label>
                  <label className="block text-[0.8rem] font-semibold text-app-text">Papel (roleName) *<input value={draft.roleName} onChange={(event) => setDraft({ ...draft, roleName: event.target.value })} className="mt-1.5 w-full rounded-[10px] border border-app-border bg-white px-3 py-2 text-[0.88rem] font-mono font-normal outline-none focus:border-app-accent" /></label>
                  <label className="block text-[0.8rem] font-semibold text-app-text">Chave *<input value={draft.key} onChange={(event) => setDraft({ ...draft, key: event.target.value })} className="mt-1.5 w-full rounded-[10px] border border-app-border bg-white px-3 py-2 text-[0.88rem] font-mono font-normal outline-none focus:border-app-accent" /></label>
                </div>
                <label className="block text-[0.8rem] font-semibold text-app-text">Descrição<textarea value={draft.description ?? ''} onChange={(event) => setDraft({ ...draft, description: event.target.value })} rows={3} className="mt-1.5 w-full rounded-[10px] border border-app-border bg-white px-3 py-2 text-[0.88rem] font-normal outline-none focus:border-app-accent" /></label>
              </>
            ) : (
              <div className="space-y-6">
                <div><h3 className="mb-3" style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)' }}>Descrição</h3><p className="text-[0.92rem] leading-relaxed text-app-text">{partyType.description || 'Nenhuma descrição informada.'}</p></div>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  {[['Título', partyType.label], ['Papel (roleName)', partyType.roleName], ['Chave', partyType.key]].map(([label, value]) => <div key={label} className="rounded-[10px] border border-app-border p-4"><span style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)' }}>{label}</span><p className="mt-1 text-[0.95rem] font-medium text-app-text">{value}</p></div>)}
                </div>
              </div>
            )}
          </form>
        )}
        {activeTab === 'characteristics' && <PartyCharacteristicCatalogEditor roleName={partyType.roleName} canMutate={canMutate} />}
        {activeTab === 'records' && <SupplierRecordsTab roleName={partyType.roleName} canMutate={canMutate} />}
      </div>
    </div>
  );
}
