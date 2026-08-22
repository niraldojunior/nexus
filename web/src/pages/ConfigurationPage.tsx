import { useEffect, useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import {
  createProjectStatusCatalogItem,
  deactivateProjectStatusCatalogItem,
  listProjectStatusCatalog,
  updateProjectStatusCatalogItem,
  type GeoProjectStatusBehavior,
  type GeoProjectStatusCatalogItem,
} from '../services/geoProjectApi';

const behaviors: Array<{ value: GeoProjectStatusBehavior; label: string }> = [
  { value: 'planning', label: 'Planejamento' },
  { value: 'execution', label: 'Execução' },
  { value: 'suspended', label: 'Suspenso' },
  { value: 'close-release', label: 'Encerrar e liberar' },
];

export function ConfigurationPage() {
  const [tab, setTab] = useState<'projects' | 'sites' | 'resources' | 'services'>('projects');
  const [items, setItems] = useState<GeoProjectStatusCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newItem, setNewItem] = useState({ code: '', name: '', sortOrder: 100, behavior: 'planning' as GeoProjectStatusBehavior });

  const reload = () => {
    setLoading(true);
    void listProjectStatusCatalog().then(setItems).catch(() => setError('Não foi possível carregar os status.')).finally(() => setLoading(false));
  };
  useEffect(reload, []);

  const update = async (item: GeoProjectStatusCatalogItem) => {
    try { await updateProjectStatusCatalogItem(item.code, item); reload(); } catch { setError('Não foi possível salvar o status.'); }
  };
  const create = async () => {
    if (!newItem.code.trim() || !newItem.name.trim()) return;
    try {
      await createProjectStatusCatalogItem({ ...newItem, code: newItem.code.trim(), name: newItem.name.trim(), active: true });
      setNewItem({ code: '', name: '', sortOrder: 100, behavior: 'planning' });
      reload();
    } catch { setError('Não foi possível criar o status. O código deve ser único.'); }
  };

  return <div className="mx-auto grid w-full max-w-[1200px] grid-cols-[190px_minmax(0,1fr)] gap-8 px-8 py-8 max-md:grid-cols-1 max-md:px-5">
    <aside className="flex gap-1 border-r border-app-border pr-4 max-md:border-r-0 max-md:border-b max-md:pb-4">
      <div className="grid w-full content-start gap-1">
        <p className="px-3 pb-2 text-[0.72rem] font-semibold uppercase tracking-[.1em] text-app-muted">Configurações</p>
        {([['projects', 'Projetos'], ['sites', 'Sites'], ['resources', 'Recursos'], ['services', 'Serviços']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setTab(value)} className={`rounded-[10px] px-3 py-2 text-left text-[0.86rem] font-medium ${tab === value ? 'bg-app-accent-soft text-app-text' : 'text-app-muted hover:bg-app-accent-soft'}`}>{label}</button>)}
      </div>
    </aside>
    <section className="min-w-0">
      {tab !== 'projects' ? <div className="rounded-[14px] border border-app-border bg-white p-5"><h1 className="font-display text-xl font-semibold">{tab === 'sites' ? 'Catálogo de Sites' : tab === 'resources' ? 'Catálogo de Recursos' : 'Catálogo de Serviços'}</h1><p className="mt-2 text-[0.88rem] text-app-muted">Os editores deste catálogo serão centralizados aqui progressivamente. A administração de status de Projeto já está disponível nesta central.</p></div> : <>
        <div className="mb-5"><h1 className="font-display text-2xl font-semibold text-app-text">Status de Projetos</h1><p className="mt-1 text-[0.88rem] text-app-muted">Códigos são imutáveis; desativar preserva o histórico e remove a opção de novas escolhas.</p></div>
        {error ? <p className="mb-3 rounded-[10px] bg-status-red-soft px-3 py-2 text-[0.82rem] text-status-red">{error}</p> : null}
        <div className="overflow-x-auto rounded-[14px] border border-app-border bg-white"><table className="w-full min-w-[650px] text-left text-[0.82rem]"><thead className="border-b border-app-border text-app-muted"><tr><th className="px-3 py-2">Código</th><th className="px-3 py-2">Nome</th><th className="px-3 py-2">Comportamento</th><th className="px-3 py-2">Ordem</th><th className="px-3 py-2">Ativo</th><th /></tr></thead><tbody>{loading ? <tr><td colSpan={6} className="px-3 py-4 text-app-muted">Carregando…</td></tr> : items.map((item) => <StatusRow key={item.code} item={item} onSave={update} onDeactivate={async () => { try { await deactivateProjectStatusCatalogItem(item.code); reload(); } catch { setError('Não foi possível desativar o status.'); } }} />)}</tbody></table></div>
        <div className="mt-4 grid grid-cols-[100px_1fr_130px_110px_auto] gap-2 rounded-[14px] border border-app-border bg-app-panel p-3 max-lg:grid-cols-1"><input value={newItem.code} onChange={(event) => setNewItem({ ...newItem, code: event.target.value })} placeholder="Código" className="geo-input"/><input value={newItem.name} onChange={(event) => setNewItem({ ...newItem, name: event.target.value })} placeholder="Nome" className="geo-input"/><select value={newItem.behavior} onChange={(event) => setNewItem({ ...newItem, behavior: event.target.value as GeoProjectStatusBehavior })} className="geo-input">{behaviors.filter((item) => item.value !== 'close-release').map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><input type="number" value={newItem.sortOrder} onChange={(event) => setNewItem({ ...newItem, sortOrder: Number(event.target.value) })} className="geo-input"/><button type="button" onClick={() => void create()} className="geo-btn primary justify-center"><Plus className="h-4 w-4"/>Adicionar</button></div>
      </>}
    </section>
  </div>;
}

function StatusRow({ item, onSave, onDeactivate }: { item: GeoProjectStatusCatalogItem; onSave: (item: GeoProjectStatusCatalogItem) => void; onDeactivate: () => void }) {
  const [draft, setDraft] = useState(item);
  useEffect(() => setDraft(item), [item]);
  return <tr className="border-b border-app-border last:border-0"><td className="px-3 py-2 font-mono text-app-muted">{item.code}</td><td className="px-3 py-2"><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="w-full rounded border border-transparent bg-transparent px-1 py-1 hover:border-app-border focus:border-app-accent-border focus:outline-none"/></td><td className="px-3 py-2"><select disabled={item.code === '17'} value={draft.behavior} onChange={(event) => setDraft({ ...draft, behavior: event.target.value as GeoProjectStatusBehavior })} className="rounded border border-app-border bg-white px-1 py-1">{behaviors.map((behavior) => <option key={behavior.value} value={behavior.value}>{behavior.label}</option>)}</select></td><td className="px-3 py-2"><input type="number" value={draft.sortOrder} onChange={(event) => setDraft({ ...draft, sortOrder: Number(event.target.value) })} className="w-16 rounded border border-app-border px-1 py-1"/></td><td className="px-3 py-2"><input type="checkbox" checked={draft.active} disabled={item.code === '1' || item.code === '17'} onChange={(event) => setDraft({ ...draft, active: event.target.checked })}/></td><td className="flex gap-1 px-3 py-2"><button type="button" onClick={() => void onSave(draft)} className="rounded p-1.5 text-app-muted hover:bg-app-accent-soft" aria-label={`Salvar ${item.name}`}><Save className="h-4 w-4"/></button>{item.active && item.code !== '1' && item.code !== '17' ? <button type="button" onClick={() => void onDeactivate()} className="rounded p-1.5 text-status-red hover:bg-status-red-soft" aria-label={`Desativar ${item.name}`}><Trash2 className="h-4 w-4"/></button> : null}</td></tr>;
}
