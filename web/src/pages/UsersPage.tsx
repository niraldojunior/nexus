import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, KeyRound, Loader2, Plus, Trash2, UserCog, X } from 'lucide-react';
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
import { PasswordStrengthField } from '../components/PasswordStrengthField';
import { isPasswordValid } from '../utils/passwordPolicy';

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
      <div className="grid gap-3 sm:grid-cols-2">
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
      </div>
      <div className="mt-3">
        <PasswordStrengthField label="Senha" value={password} onChange={setPassword} showGenerator />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {ASSIGNABLE_ROLES.map((role) => (
          <RoleChip key={role} role={role} active={roles.includes(role)} onToggle={() => toggleRole(role)} />
        ))}
      </div>
      <button
        type="button"
        onClick={() => void submit()}
        disabled={submitting || !name.trim() || !email.trim() || !isPasswordValid(password)}
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
  const [resetOpen, setResetOpen] = useState(false);
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
          onClick={() => setResetOpen(true)}
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

      {resetOpen ? (
        <ResetPasswordModal
          user={user}
          onClose={() => setResetOpen(false)}
          onSubmit={(password) => {
            onResetPassword(password);
            setResetOpen(false);
          }}
        />
      ) : null}
    </li>
  );
}

function ResetPasswordModal({
  user,
  onClose,
  onSubmit,
}: {
  user: AdminUser;
  onClose: () => void;
  onSubmit: (password: string) => void;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (!dialogRef.current?.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose]);

  const mismatch = confirm.length > 0 && password !== confirm;
  const canSubmit = isPasswordValid(password) && password === confirm;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-[460px] rounded-[26px] border border-app-border bg-white p-5 shadow-modal"
      >
        <div className="mb-4 flex items-start justify-between gap-4 border-b border-app-border pb-4">
          <div className="min-w-0">
            <h3 id={titleId} className="font-display text-[1.35rem] font-semibold text-app-text">
              Redefinir senha
            </h3>
            <p className="mt-1 truncate text-[0.82rem] text-app-muted">
              {user.name} · {user.email ?? user.externalId}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-app-muted transition hover:bg-app-accent-soft"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-4">
          <PasswordStrengthField
            label="Nova senha"
            value={password}
            onChange={setPassword}
            autoFocus
            showGenerator
          />

          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${titleId}-confirm`} className="text-[0.78rem] font-medium text-app-muted">
              Confirmar senha
            </label>
            <input
              id={`${titleId}-confirm`}
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              className="h-11 rounded-xl border border-app-border bg-white px-3 text-[0.92rem] text-app-text outline-none focus:border-app-accent-border"
              placeholder="••••••••••••"
            />
            {mismatch ? (
              <p className="text-[0.76rem] text-status-red">As senhas não conferem.</p>
            ) : null}
          </div>

          <p className="text-[0.76rem] text-app-muted">
            Redefinir a senha encerra as sessões ativas do usuário.
          </p>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 items-center rounded-lg border border-app-border px-4 text-[0.88rem] font-medium text-app-text transition hover:bg-black/5"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onSubmit(password)}
            disabled={!canSubmit}
            className="flex h-10 items-center gap-2 rounded-lg bg-app-ink px-4 text-[0.88rem] font-semibold text-app-on-ink transition hover:brightness-110 disabled:opacity-50"
          >
            <KeyRound className="h-4 w-4" /> Redefinir senha
          </button>
        </div>
      </div>
    </div>,
    document.body,
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
