import { KeyRound, ShieldAlert } from 'lucide-react';
import { useId, useState } from 'react';
import { Button, Modal } from './ui';
import { PasswordStrengthField } from './PasswordStrengthField';
import { MIN_PASSWORD_LENGTH } from '../utils/passwordPolicy';

type PasswordChangeModalProps = {
  isOpen: boolean;
  onClose: () => void;
  // Modo self: usuário trocando a própria senha (exige currentPassword)
  // Modo admin: admin redefinindo a senha de outro usuário (não exige currentPassword)
  mode?: 'self' | 'admin';
  userSubtitle?: string;
  onSubmitSelf?: (currentPassword: string, newPassword: string) => Promise<void>;
  onSubmitAdmin?: (newPassword: string) => Promise<void>;
};

export default function PasswordChangeModal({
  isOpen,
  onClose,
  mode = 'self',
  userSubtitle,
  onSubmitSelf,
  onSubmitAdmin,
}: PasswordChangeModalProps) {
  const titleId = useId();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!isOpen) return null;

  const mismatch = confirm.length > 0 && newPassword !== confirm;
  const currentOk = mode === 'admin' || currentPassword.length > 0;
  const hasMinLength = newPassword.length >= MIN_PASSWORD_LENGTH;
  const passwordsMatch = newPassword.length > 0 && newPassword === confirm;
  const canSubmit = currentOk && hasMinLength && passwordsMatch && !busy;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setError(null);
    setBusy(true);
    try {
      if (mode === 'self') {
        if (!onSubmitSelf) throw new Error('Handler não configurado');
        await onSubmitSelf(currentPassword, newPassword);
      } else {
        if (!onSubmitAdmin) throw new Error('Handler não configurado');
        await onSubmitAdmin(newPassword);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao alterar a senha');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={
        <div>
          <div className="font-display text-[1.15rem] font-semibold text-app-text">
            {mode === 'self' ? 'Trocar minha senha' : 'Redefinir senha'}
          </div>
          {userSubtitle && <div className="text-[0.8rem] text-app-muted">{userSubtitle}</div>}
        </div>
      }
      onClose={onClose}
      width={460}
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button
            variant="dark"
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            iconLeft={<KeyRound className="h-4 w-4" />}
          >
            {busy ? 'Salvando...' : 'Salvar nova senha'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-status-red/30 bg-status-red-soft p-3 text-[0.82rem] text-status-red">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {mode === 'self' && (
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={`${titleId}-current`}
              className="text-[0.78rem] font-medium text-app-muted"
            >
              Senha atual
            </label>
            <input
              id={`${titleId}-current`}
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="h-11 rounded-xl border border-app-border bg-app-panel px-3 text-[0.92rem] text-app-text outline-none focus:border-app-accent focus:shadow-[0_0_0_var(--vt-yellow-focus-ring-width)_var(--vt-yellow-focus-ring-color)]"
              placeholder="••••••••••••"
              autoFocus
            />
          </div>
        )}

        <PasswordStrengthField
          label="Nova senha"
          value={newPassword}
          onChange={setNewPassword}
          autoFocus={mode === 'admin'}
          showGenerator
        />

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={`${titleId}-confirm`}
            className="text-[0.78rem] font-medium text-app-muted"
          >
            Confirmar nova senha
          </label>
          <input
            id={`${titleId}-confirm`}
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="h-11 rounded-xl border border-app-border bg-app-panel px-3 text-[0.92rem] text-app-text outline-none focus:border-app-accent-border"
            placeholder="••••••••••••"
          />
          {mismatch ? (
            <p className="text-[0.76rem] text-status-red">As senhas não conferem.</p>
          ) : null}
        </div>

        <p className="text-[0.76rem] text-app-muted">
          Trocar a senha encerra todas as outras sessões ativas.
        </p>
      </div>
    </Modal>
  );
}
