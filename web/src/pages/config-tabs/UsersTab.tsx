import { useEffect, useId, useMemo, useState, type FormEvent, type ReactNode } from 'react';
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
} from '../../services/authApi';
import { PasswordStrengthField } from '../../components/PasswordStrengthField';
import Field from '../../components/Field';
import { isPasswordValid } from '../../utils/passwordPolicy';
import PageHead from '../../components/ui/PageHead';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import { SortableHeader, sortedBy, useSort } from './sortable';

function ModalTitle({
  eyebrow,
  title,
  subtitle,
  onClose,
}: {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? (
          <div className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-app-muted">
            {eyebrow}
          </div>
        ) : null}
        <div className="mt-0.5 font-display text-[1.3rem] font-semibold text-app-text">{title}</div>
        {subtitle ? (
          <p className="mt-1 truncate text-[0.82rem] font-normal text-app-muted">{subtitle}</p>
        ) : null}
      </div>
      <button
        type="button"
        className="rounded-full p-2 text-app-muted transition hover:bg-app-accent-soft"
        onClick={onClose}
        aria-label="Fechar"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  );
}

// Administração de contas — aba de Configurações visível apenas para papéis admin (o
// ConfigurationPage/App condiciona o acesso à rota). Criar usuário, editar papéis, ativar/
// desativar e redefinir senha. Sem exclusão física de conteúdo do inventário (C6); aqui a
// exclusão é de conta de acesso, que é física mesmo (não há histórico de conta a preservar).
export function UsersTab() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [rolesUser, setRolesUser] = useState<AdminUser | null>(null);
  const [resetUser, setResetUser] = useState<AdminUser | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<AdminUser | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    void listUsers()
      .then(setUsers)
      .catch((err) => setError(err instanceof Error ? err.message : 'Falha ao carregar usuários.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const runAction = (id: string, action: () => Promise<unknown>) => {
    setBusyId(id);
    setError(null);
    return action()
      .then(load)
      .catch((err) => setError(err instanceof Error ? err.message : 'Ação falhou.'))
      .finally(() => setBusyId(null));
  };

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return users;
    return users.filter(
      (user) =>
        user.name.toLowerCase().includes(term) ||
        (user.email ?? user.externalId).toLowerCase().includes(term),
    );
  }, [users, search]);

  const [sort, onSort] = useSort<'name' | 'email' | 'roles' | 'status'>();
  const sortedUsers = useMemo(
    () =>
      sortedBy(filteredUsers, sort, (user, key) => {
        switch (key) {
          case 'name':
            return user.name;
          case 'email':
            return user.email ?? user.externalId;
          case 'roles':
            return user.roles.join(', ');
          case 'status':
            return user.status;
          default:
            return '';
        }
      }),
    [filteredUsers, sort],
  );

  const removeUser = async () => {
    if (!pendingRemoval) return;
    await runAction(pendingRemoval.id, () => deleteUser(pendingRemoval.id));
    setPendingRemoval(null);
  };

  return (
    <>
      <PageHead
        title="Usuários"
        subtitle="Contas de acesso à plataforma, papéis (RBAC) e redefinição de senha."
        actions={
          <Button onClick={() => setCreateOpen(true)} iconLeft={<Plus className="h-4 w-4" />}>
            Adicionar
          </Button>
        }
      />

      {error ? (
        <p className="mb-3 rounded-[10px] bg-status-red-soft px-3 py-2 text-[0.82rem] text-status-red">
          {error}
        </p>
      ) : null}

      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Buscar por nome ou e-mail…"
        className="geo-input mb-3 max-w-sm"
      />

      <div className="vt-card vt-table-card" style={{ overflow: 'hidden', padding: 0 }}>
        <table className="vt-table" style={{ minWidth: 750 }}>
          <thead>
            <tr>
              <SortableHeader label="Nome" sortKey="name" sort={sort} onSort={onSort} />
              <SortableHeader label="E-mail" sortKey="email" sort={sort} onSort={onSort} />
              <SortableHeader label="Papéis" sortKey="roles" sort={sort} onSort={onSort} />
              <SortableHeader label="Status" sortKey="status" sort={sort} onSort={onSort} />
              <th />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5}>Carregando…</td>
              </tr>
            ) : sortedUsers.length === 0 ? (
              <tr>
                <td colSpan={5}>Nenhum usuário encontrado.</td>
              </tr>
            ) : (
              sortedUsers.map((user) => {
                const disabled = user.status !== 'active';
                const busy = busyId === user.id;
                return (
                  <tr key={user.id}>
                    <td className="font-medium" style={{ color: 'var(--text-primary)' }}>
                      {user.name}
                    </td>
                    <td>{user.email ?? user.externalId}</td>
                    <td>{user.roles.join(', ') || '-'}</td>
                    <td>
                      <Badge tone={disabled ? 'neutral' : 'green'}>
                        {disabled ? 'Inativo' : 'Ativo'}
                      </Badge>
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        {busy ? <Loader2 className="h-4 w-4 animate-spin text-app-muted" /> : null}
                        <button
                          type="button"
                          onClick={() => setRolesUser(user)}
                          className="rounded-xl border border-transparent p-1.5 text-app-muted transition hover:border-app-border hover:bg-app-accent-soft"
                          title="Editar papéis"
                          aria-label={`Editar papéis de ${user.name}`}
                          disabled={busy}
                        >
                          <UserCog className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setResetUser(user)}
                          className="rounded-xl border border-transparent p-1.5 text-app-muted transition hover:border-app-border hover:bg-app-accent-soft"
                          title="Redefinir senha"
                          aria-label={`Redefinir senha de ${user.name}`}
                          disabled={busy}
                        >
                          <KeyRound className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void runAction(user.id, () =>
                              setUserStatus(user.id, disabled ? 'active' : 'disabled'),
                            )
                          }
                          className="rounded-xl border border-app-border px-2.5 py-1 text-[0.76rem] font-medium text-app-text transition hover:bg-app-accent-soft"
                          disabled={busy}
                        >
                          {disabled ? 'Ativar' : 'Desativar'}
                        </button>
                        {pendingRemoval?.id === user.id ? (
                          <button
                            type="button"
                            onClick={() => void removeUser()}
                            className="rounded-xl border border-status-red/30 bg-status-red-soft px-2 py-1 text-[0.75rem] font-semibold text-status-red"
                            disabled={busy}
                          >
                            Confirmar
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setPendingRemoval(user);
                              setError(null);
                            }}
                            className="rounded-xl border border-transparent p-1.5 text-status-red transition hover:border-status-red hover:bg-status-red-soft"
                            title="Excluir conta"
                            aria-label={`Excluir ${user.name}`}
                            disabled={busy}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {createOpen ? (
        <CreateUserModal
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            load();
          }}
        />
      ) : null}

      {rolesUser ? (
        <EditRolesModal
          user={rolesUser}
          onClose={() => setRolesUser(null)}
          onSubmit={(roles) => {
            setRolesUser(null);
            void runAction(rolesUser.id, () => setUserRoles(rolesUser.id, roles));
          }}
        />
      ) : null}

      {resetUser ? (
        <ResetPasswordModal
          user={resetUser}
          onClose={() => setResetUser(null)}
          onSubmit={(password) => {
            setResetUser(null);
            void runAction(resetUser.id, () => resetUserPassword(resetUser.id, password));
          }}
        />
      ) : null}
    </>
  );
}

function useEscapeToClose(active: boolean, onClose: () => void) {
  useEffect(() => {
    if (!active) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [active, onClose]);
}

function CreateUserModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [roles, setRoles] = useState<string[]>(['inventory.reader']);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEscapeToClose(!submitting, onClose);

  const toggleRole = (role: string) =>
    setRoles((current) =>
      current.includes(role) ? current.filter((item) => item !== role) : [...current, role],
    );

  const submitValid = Boolean(name.trim()) && Boolean(email.trim()) && isPasswordValid(password);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!submitValid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await createUser({ name: name.trim(), email: email.trim(), password, roles });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar usuário.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={
        <ModalTitle
          eyebrow="Usuários"
          title="Novo usuário"
          onClose={onClose}
        />
      }
      onClose={onClose}
      width={560}
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button type="submit" form="create-user-form" disabled={submitting || !submitValid}>
            {submitting ? 'Criando...' : 'Criar'}
          </Button>
        </>
      }
    >
      {error ? (
        <p className="mb-3 rounded-[10px] bg-status-red-soft px-3 py-2 text-[0.82rem] text-status-red">
          {error}
        </p>
      ) : null}

      <form id="create-user-form" onSubmit={(event) => void submit(event)} className="grid gap-4">
        <Field label="Nome">
          <input
            className="geo-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
          />
        </Field>
        <Field label="E-mail">
          <input
            type="email"
            className="geo-input"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
        <PasswordStrengthField label="Senha" value={password} onChange={setPassword} showGenerator />
        <Field label="Papéis">
          <div className="flex flex-wrap gap-1.5">
            {ASSIGNABLE_ROLES.map((role) => (
              <RoleChip
                key={role}
                role={role}
                active={roles.includes(role)}
                onToggle={() => toggleRole(role)}
              />
            ))}
          </div>
        </Field>
      </form>
    </Modal>
  );
}

function EditRolesModal({
  user,
  onClose,
  onSubmit,
}: {
  user: AdminUser;
  onClose: () => void;
  onSubmit: (roles: string[]) => void;
}) {
  const [draftRoles, setDraftRoles] = useState<string[]>(user.roles);

  useEscapeToClose(true, onClose);

  const toggleDraft = (role: string) =>
    setDraftRoles((current) =>
      current.includes(role) ? current.filter((item) => item !== role) : [...current, role],
    );

  return (
    <Modal
      title={
        <ModalTitle
          eyebrow="Usuários"
          title="Editar papéis"
          subtitle={`${user.name} · ${user.email ?? user.externalId}`}
          onClose={onClose}
        />
      }
      onClose={onClose}
      width={480}
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => onSubmit(draftRoles)}
            iconLeft={<Check className="h-4 w-4" />}
          >
            Salvar
          </Button>
        </>
      }
    >
      <div className="flex flex-wrap gap-1.5">
        {ASSIGNABLE_ROLES.map((role) => (
          <RoleChip
            key={role}
            role={role}
            active={draftRoles.includes(role)}
            onToggle={() => toggleDraft(role)}
          />
        ))}
      </div>
    </Modal>
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
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  useEscapeToClose(true, onClose);

  const mismatch = confirm.length > 0 && password !== confirm;
  const canSubmit = isPasswordValid(password) && password === confirm;

  return (
    <Modal
      title={
        <ModalTitle
          title="Redefinir senha"
          subtitle={`${user.name} · ${user.email ?? user.externalId}`}
          onClose={onClose}
        />
      }
      onClose={onClose}
      width={460}
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="dark"
            type="button"
            onClick={() => onSubmit(password)}
            disabled={!canSubmit}
            iconLeft={<KeyRound className="h-4 w-4" />}
          >
            Redefinir senha
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <PasswordStrengthField
          label="Nova senha"
          value={password}
          onChange={setPassword}
          autoFocus
          showGenerator
        />

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={`${titleId}-confirm`}
            className="text-[0.78rem] font-medium text-app-muted"
          >
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
    </Modal>
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
