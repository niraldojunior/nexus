import { useCallback, useEffect, useState } from 'react';
import { Check, KeyRound, Loader2, Plus, Trash2, UserCog } from 'lucide-react';
import {
  ASSIGNABLE_ROLES,
  createUser,
  deleteUser,
  listUsers,
  resetUserPassword,
  setUserRoles,
  setUserStatus,
  type AdminUser,
} from '../services/authApi';

// Administração de contas — visível apenas para papéis admin (o App condiciona a rota).
// Criar usuário, editar papéis, ativar/desativar e redefinir senha. Sem exclusão física de
// conteúdo do inventário; aqui a exclusão é de conta de acesso.
export default function UsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setUsers(await listUsers());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar usuários.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runAction = useCallback(
    async (id: string, action: () => Promise<unknown>) => {
      setBusyId(id);
      setError(null);
      try {
        await action();
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Ação falhou.');
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  return (
    <div className="mx-auto flex max-w-[980px] flex-col gap-6 px-6 py-8">
      <header>
        <h1 className="font-display text-[1.7rem] font-semibold tracking-[-0.02em] text-app-text">
          Usuários
        </h1>
        <p className="mt-1 text-[0.88rem] text-app-muted">
          Contas de acesso à plataforma, papéis (RBAC) e redefinição de senha.
        </p>
      </header>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[0.86rem] text-red-700">
          {error}
        </div>
      ) : null}

      <CreateUserForm onCreated={load} onError={setError} />

      <section className="overflow-hidden rounded-2xl border border-app-border bg-app-panel">
        <div className="flex items-center justify-between border-b border-app-border px-4 py-3">
          <h2 className="text-[0.92rem] font-semibold text-app-text">Contas</h2>
          {loading ? <Loader2 className="h-4 w-4 animate-spin text-app-muted" /> : null}
        </div>
        <ul className="divide-y divide-app-border">
          {users.map((user) => (
            <UserRow
              key={user.id}
              user={user}
              busy={busyId === user.id}
              onSetRoles={(roles) => runAction(user.id, () => setUserRoles(user.id, roles))}
              onToggleStatus={() =>
                runAction(user.id, () =>
                  setUserStatus(user.id, user.status === 'active' ? 'disabled' : 'active'),
                )
              }
              onResetPassword={(password) =>
                runAction(user.id, () => resetUserPassword(user.id, password))
              }
              onDelete={() => runAction(user.id, () => deleteUser(user.id))}
            />
          ))}
          {!loading && users.length === 0 ? (
            <li className="px-4 py-6 text-center text-[0.86rem] text-app-muted">
              Nenhum usuário cadastrado.
            </li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}

function CreateUserForm({
  onCreated,
  onError,
}: {
  onCreated: () => void;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [roles, setRoles] = useState<string[]>(['inventory.reader']);
  const [submitting, setSubmitting] = useState(false);

  const toggleRole = (role: string) =>
    setRoles((current) =>
      current.includes(role) ? current.filter((item) => item !== role) : [...current, role],
    );

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await createUser({ name: name.trim(), email: email.trim(), password, roles });
      setName('');
      setEmail('');
      setPassword('');
      setRoles(['inventory.reader']);
      onCreated();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Falha ao criar usuário.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="rounded-2xl border border-app-border bg-app-panel p-4">
      <h2 className="mb-3 flex items-center gap-2 text-[0.92rem] font-semibold text-app-text">
        <Plus className="h-4 w-4" /> Novo usuário
      </h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Nome"
          className="h-10 rounded-lg border border-app-border bg-white px-3 text-[0.88rem] text-app-text outline-none focus:border-app-accent-border"
        />
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="E-mail"
          className="h-10 rounded-lg border border-app-border bg-white px-3 text-[0.88rem] text-app-text outline-none focus:border-app-accent-border"
        />
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Senha (mín. 12)"
          className="h-10 rounded-lg border border-app-border bg-white px-3 text-[0.88rem] text-app-text outline-none focus:border-app-accent-border"
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {ASSIGNABLE_ROLES.map((role) => (
          <RoleChip key={role} role={role} active={roles.includes(role)} onToggle={() => toggleRole(role)} />
        ))}
      </div>
      <button
        type="button"
        onClick={() => void submit()}
        disabled={submitting || !name.trim() || !email.trim() || password.length < 12}
        className="mt-4 flex h-10 items-center gap-2 rounded-lg bg-app-ink px-4 text-[0.88rem] font-semibold text-app-on-ink transition hover:brightness-110 disabled:opacity-50"
      >
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        Criar usuário
      </button>
    </section>
  );
}

function UserRow({
  user,
  busy,
  onSetRoles,
  onToggleStatus,
  onResetPassword,
  onDelete,
}: {
  user: AdminUser;
  busy: boolean;
  onSetRoles: (roles: string[]) => void;
  onToggleStatus: () => void;
  onResetPassword: (password: string) => void;
  onDelete: () => void;
}) {
  const [editingRoles, setEditingRoles] = useState(false);
  const [draftRoles, setDraftRoles] = useState<string[]>(user.roles);
  const disabled = user.status !== 'active';

  const toggleDraft = (role: string) =>
    setDraftRoles((current) =>
      current.includes(role) ? current.filter((item) => item !== role) : [...current, role],
    );

  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.9rem] font-medium text-app-text">
            {user.name}
            {disabled ? (
              <span className="ml-2 rounded bg-app-border px-1.5 py-0.5 text-[0.66rem] font-semibold uppercase text-app-muted">
                Inativo
              </span>
            ) : null}
          </p>
          <p className="truncate text-[0.76rem] text-app-muted">
            {user.email ?? user.externalId} · {user.roles.join(', ') || 'sem papéis'}
          </p>
        </div>
        {busy ? <Loader2 className="h-4 w-4 animate-spin text-app-muted" /> : null}
        <button
          type="button"
          onClick={() => {
            setDraftRoles(user.roles);
            setEditingRoles((value) => !value);
          }}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-app-muted transition hover:bg-black/5"
          title="Editar papéis"
          aria-label={`Editar papéis de ${user.name}`}
        >
          <UserCog className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => {
            const password = window.prompt(`Nova senha para ${user.name} (mín. 12 caracteres):`);
            if (password && password.length >= 12) onResetPassword(password);
          }}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-app-muted transition hover:bg-black/5"
          title="Redefinir senha"
          aria-label={`Redefinir senha de ${user.name}`}
        >
          <KeyRound className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onToggleStatus}
          className="rounded-lg border border-app-border px-2.5 py-1 text-[0.76rem] font-medium text-app-text transition hover:bg-black/5"
        >
          {disabled ? 'Ativar' : 'Desativar'}
        </button>
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`Excluir a conta de ${user.name}?`)) onDelete();
          }}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-red-500 transition hover:bg-red-50"
          title="Excluir conta"
          aria-label={`Excluir ${user.name}`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {editingRoles ? (
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-app-bg/60 p-2">
          {ASSIGNABLE_ROLES.map((role) => (
            <RoleChip
              key={role}
              role={role}
              active={draftRoles.includes(role)}
              onToggle={() => toggleDraft(role)}
            />
          ))}
          <button
            type="button"
            onClick={() => {
              onSetRoles(draftRoles);
              setEditingRoles(false);
            }}
            className="ml-auto flex items-center gap-1 rounded-lg bg-app-ink px-2.5 py-1 text-[0.76rem] font-semibold text-app-on-ink"
          >
            <Check className="h-3.5 w-3.5" /> Salvar
          </button>
        </div>
      ) : null}
    </li>
  );
}

function RoleChip({
  role,
  active,
  onToggle,
}: {
  role: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`rounded-full border px-2.5 py-1 text-[0.72rem] font-medium transition ${
        active
          ? 'border-app-accent-border bg-app-accent-soft text-app-text'
          : 'border-app-border bg-white text-app-muted hover:bg-black/5'
      }`}
    >
      {role}
    </button>
  );
}
