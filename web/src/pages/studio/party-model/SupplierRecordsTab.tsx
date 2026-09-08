import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import {
  createParty,
  createPartyRole,
  deletePartyRole,
  listPartyRoles,
  updateParty,
  updatePartyRole,
  type Characteristic,
  type PartyRole,
} from '../../../services/partyApi';
import {
  listPartyRoleTypeCharacteristics,
  type PartyRoleTypeCharacteristic,
} from '../../../services/partyRoleTypeCharacteristicApi';
import { Button, Modal } from '../../../components/ui';
import Field from '../../../components/Field';
import { SortableHeader, sortedBy, useSort } from '../../config-tabs/sortable';

export type SupplierRecordsTabProps = { roleName: string; canMutate: boolean };
type Draft = { name: string; values: Record<string, string | boolean> };
const emptyDraft = (): Draft => ({ name: '', values: {} });

const statusLabel: Record<PartyRole['status'], string> = { active: 'Ativo', inactive: 'Inativo', terminated: 'Encerrado' };
const draftFrom = (role?: PartyRole): Draft => ({
  name: role?.party.name ?? '',
  values: Object.fromEntries(
    (role?.partyRoleCharacteristic ?? []).map((item) => [
      item.name,
      typeof item.value === 'boolean'
        ? item.value
        : item.value && typeof item.value === 'object'
          ? JSON.stringify(item.value)
          : String(item.value ?? ''),
    ]),
  ),
});

export function SupplierRecordsTab({ roleName, canMutate }: SupplierRecordsTabProps) {
  const [records, setRecords] = useState<PartyRole[]>([]);
  const [characteristics, setCharacteristics] = useState<PartyRoleTypeCharacteristic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; role: PartyRole | null } | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [sort, onSort] = useSort<'name' | 'status'>();

  const reload = () => {
    setLoading(true);
    Promise.all([
      listPartyRoles({ name: roleName, limit: 200, offset: 0 }),
      listPartyRoleTypeCharacteristics(roleName),
    ])
      .then(([nextRecords, nextCharacteristics]) => {
        setRecords(nextRecords);
        setCharacteristics(nextCharacteristics.filter((item) => item.active));
      })
      .catch(() => setError('Não foi possível carregar as especificações.'))
      .finally(() => setLoading(false));
  };
  useEffect(reload, [roleName]);

  const sorted = useMemo(() => sortedBy(records, sort, (role, key) => key === 'name' ? role.party.name ?? '' : statusLabel[role.status]), [records, sort]);
  const openCreate = () => { setDraft(emptyDraft()); setModal({ mode: 'create', role: null }); setError(null); };
  const openEdit = (role: PartyRole) => { setDraft(draftFrom(role)); setModal({ mode: 'edit', role }); setError(null); };
  const close = () => { if (!saving) setModal(null); };

  const serialize = (): Characteristic[] | null => {
    const configured = characteristics.flatMap((item): Characteristic[] => {
      const raw = draft.values[item.name];
      if (raw === '' || raw === undefined) return [];
      if (item.valueType === 'json') {
        try { const value = JSON.parse(String(raw)); return typeof value === 'object' && value && !Array.isArray(value) ? [{ name: item.name, value, valueType: 'json' }] : []; } catch { return []; }
      }
      const value = item.valueType === 'boolean' ? Boolean(raw) : item.valueType === 'integer' || item.valueType === 'decimal' ? Number(raw) : String(raw);
      if ((item.valueType === 'integer' || item.valueType === 'decimal') && Number.isNaN(value)) return [];
      return [{ name: item.name, value, valueType: item.valueType, ...(item.allowedValues ? { allowedValues: item.allowedValues } : {}) }];
    });
    const invalidJson = characteristics.some((item) => item.valueType === 'json' && draft.values[item.name] && !configured.some((value) => value.name === item.name));
    if (invalidJson) return null;
    const legacy = (modal?.role?.partyRoleCharacteristic ?? []).filter((item) => !characteristics.some((characteristic) => characteristic.name === item.name));
    return [...legacy, ...configured];
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!modal || !draft.name.trim()) return;
    const payload = serialize();
    if (!payload) { setError('Informe JSON válido para as características do tipo JSON.'); return; }
    setSaving(true); setError(null);
    try {
      if (modal.mode === 'create') {
        const party = await createParty({ name: draft.name.trim(), partyType: 'Organization' });
        await createPartyRole({ partyId: party.id, name: roleName, partyRoleCharacteristic: payload });
      } else if (modal.role) {
        await updateParty(modal.role.partyId, { name: draft.name.trim() });
        await updatePartyRole(modal.role.id, { partyRoleCharacteristic: payload });
      }
      setModal(null); reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível salvar a especificação.'); }
    finally { setSaving(false); }
  };

  const deactivate = async (role: PartyRole) => {
    if (!window.confirm(`Inativar ${role.party.name ?? 'esta especificação'}?`)) return;
    try { await deletePartyRole(role.id); reload(); } catch { setError('Não foi possível inativar a especificação.'); }
  };

  return <div className="space-y-4">
    {canMutate && <div className="flex justify-end"><Button variant="primary" size="sm" iconLeft={<Plus className="h-4 w-4" />} onClick={openCreate}>Adicionar</Button></div>}
    {error && !modal && <p className="rounded-[10px] bg-status-red-soft px-3 py-2 text-[0.82rem] text-status-red">{error}</p>}
    <div className="vt-card vt-table-card overflow-x-auto" style={{ padding: 0 }}><table className="vt-table" style={{ minWidth: 440 }}><thead><tr><SortableHeader label="Nome" sortKey="name" sort={sort} onSort={onSort} /><SortableHeader label="Status" sortKey="status" sort={sort} onSort={onSort} /><th /></tr></thead><tbody>
      {loading ? <tr><td colSpan={3}>Carregando…</td></tr> : records.length === 0 ? <tr><td colSpan={3}>Nenhuma especificação cadastrada.</td></tr> : sorted.map((role) => <tr key={role.id} role="button" tabIndex={0} onClick={() => openEdit(role)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openEdit(role); } }} className="cursor-pointer hover:bg-black/[0.02]"><td className="font-medium" style={{ color: 'var(--text-primary)' }}>{role.party.name}</td><td>{statusLabel[role.status]}</td><td><div className="flex justify-end gap-1" onClick={(event) => event.stopPropagation()}>{canMutate && <button type="button" onClick={() => openEdit(role)} className="rounded-xl p-1.5 text-app-muted hover:bg-app-accent-soft" aria-label={`Editar ${role.party.name ?? ''}`}><Pencil className="h-4 w-4" /></button>}{canMutate && role.status === 'active' && <button type="button" onClick={() => void deactivate(role)} className="rounded-xl p-1.5 text-status-red hover:bg-status-red-soft" aria-label={`Inativar ${role.party.name ?? ''}`}><Trash2 className="h-4 w-4" /></button>}</div></td></tr>)}
    </tbody></table></div>
    {modal && <RecordModal mode={modal.mode} draft={draft} characteristics={characteristics} saving={saving} error={error} onChange={setDraft} onSubmit={submit} onClose={close} />}
  </div>;
}

function RecordModal({ mode, draft, characteristics, saving, error, onChange, onSubmit, onClose }: { mode: 'create' | 'edit'; draft: Draft; characteristics: PartyRoleTypeCharacteristic[]; saving: boolean; error: string | null; onChange: (next: Draft) => void; onSubmit: (event: FormEvent) => void; onClose: () => void }) {
  const updateValue = (name: string, value: string | boolean) => onChange({ ...draft, values: { ...draft.values, [name]: value } });
  return <Modal title={<div className="flex items-center justify-between gap-4"><span>{mode === 'create' ? 'Criar especificação' : 'Editar especificação'}</span><button type="button" onClick={onClose} aria-label="Fechar" className="rounded-full p-2 text-app-muted hover:bg-app-accent-soft"><X className="h-5 w-5" /></button></div>} onClose={onClose} width={560} footer={<><Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button><Button type="submit" form="party-record-form" disabled={saving || !draft.name.trim()}>{saving ? 'Salvando…' : mode === 'create' ? 'Criar' : 'Salvar'}</Button></>}>
    {error && <p className="mb-3 rounded-[10px] bg-status-red-soft px-3 py-2 text-[0.82rem] text-status-red">{error}</p>}
    <form id="party-record-form" onSubmit={onSubmit} className="grid gap-4"><Field label="Nome"><input value={draft.name} onChange={(event) => onChange({ ...draft, name: event.target.value })} className="geo-input" autoFocus /></Field>{characteristics.map((item) => <DynamicCharacteristicField key={item.id} item={item} value={draft.values[item.name]} onChange={(value) => updateValue(item.name, value)} />)}</form>
  </Modal>;
}

function DynamicCharacteristicField({ item, value, onChange }: { item: PartyRoleTypeCharacteristic; value: string | boolean | undefined; onChange: (value: string | boolean) => void }) {
  const label = item.description ? `${item.name} — ${item.description}` : item.name;
  if (item.valueType === 'boolean') return <label className="flex items-center gap-2 text-[0.84rem] text-app-text"><input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />{label}</label>;
  if (item.valueType === 'list') return <Field label={label}><select className="geo-input" value={String(value ?? '')} onChange={(event) => onChange(event.target.value)}><option value="">Selecione…</option>{item.allowedValues?.map((option) => <option key={option} value={option}>{option}</option>)}</select></Field>;
  const type = item.valueType === 'integer' || item.valueType === 'decimal' ? 'number' : item.valueType === 'date' ? 'date' : 'text';
  if (item.valueType === 'json') return <Field label={label}><textarea className="geo-input font-mono" rows={3} value={String(value ?? '')} onChange={(event) => onChange(event.target.value)} placeholder="{ }" /></Field>;
  return <Field label={label}><input className="geo-input" type={type} step={item.valueType === 'decimal' ? 'any' : undefined} value={String(value ?? '')} onChange={(event) => onChange(event.target.value)} /></Field>;
}
