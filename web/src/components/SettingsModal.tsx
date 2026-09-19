import {
  Check,
  KeyRound,
  LayoutGrid,
  Moon,
  Palette,
  Sun,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useSession } from '../hooks/useSession';
import { changeOwnPassword, updateProfile } from '../services/authApi';
import { getRoleDefinition } from '../services/roleCatalog';
import { updateSessionUser } from '../services/session';
import { readProjectIcon } from '../utils/projectIconImage';
import PasswordChangeModal from './PasswordChangeModal';
import { Button } from './ui';

export type SettingsSection = 'general' | 'visual';

interface SettingsModalProps {
  isOpen: boolean;
  activeSection: SettingsSection;
  onClose: () => void;
  onSelectSection: (section: SettingsSection) => void;
}

const initialOf = (name?: string): string => name?.trim()?.[0]?.toUpperCase() ?? 'U';

export default function SettingsModal({
  isOpen,
  activeSection,
  onClose,
  onSelectSection,
}: SettingsModalProps) {
  const { user } = useSession();
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !user) {
    return null;
  }

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setSaving(true);
    try {
      const dataUrl = await readProjectIcon(file);
      await updateProfile({ avatarUrl: dataUrl });
      updateSessionUser({ avatarUrl: dataUrl });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Erro ao carregar imagem');
    } finally {
      setSaving(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemovePhoto = async () => {
    setUploadError(null);
    setSaving(true);
    try {
      await updateProfile({ avatarUrl: null });
      updateSessionUser({ avatarUrl: null });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Erro ao remover foto');
    } finally {
      setSaving(false);
    }
  };

  const handleSelectTheme = async (theme: 'light' | 'dark') => {
    updateSessionUser({ theme });
    try {
      await updateProfile({ theme });
    } catch {
      // Falha de rede silenciosa; o estado local já foi aplicado
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[3px] sm:p-6">
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Configurações do Usuário"
          className="flex h-[min(680px,calc(100dvh-32px))] w-full max-w-[920px] overflow-hidden rounded-[24px] border border-app-border bg-app-panel shadow-modal sm:h-[min(680px,calc(100dvh-48px))]"
        >
          {/* Coluna de navegação esquerda */}
          <div className="flex w-[220px] shrink-0 flex-col border-r border-app-border bg-app-sidebar px-3 py-4">
            <div className="px-3 pb-3 text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-app-muted">
              Preferências
            </div>

            <nav className="space-y-1">
              <button
                type="button"
                onClick={() => onSelectSection('general')}
                className={`flex w-full items-center gap-3 rounded-[12px] border px-3 py-2.5 text-left transition ${
                  activeSection === 'general'
                    ? 'border-app-accent-border bg-app-accent-soft text-app-text shadow-soft font-semibold'
                    : 'border-transparent text-app-text hover:border-app-border hover:bg-app-panel'
                }`}
              >
                <LayoutGrid className="h-4 w-4" strokeWidth={1.8} />
                <span className="text-[0.88rem]">Geral</span>
              </button>

              <button
                type="button"
                onClick={() => onSelectSection('visual')}
                className={`flex w-full items-center gap-3 rounded-[12px] border px-3 py-2.5 text-left transition ${
                  activeSection === 'visual'
                    ? 'border-app-accent-border bg-app-accent-soft text-app-text shadow-soft font-semibold'
                    : 'border-transparent text-app-text hover:border-app-border hover:bg-app-panel'
                }`}
              >
                <Palette className="h-4 w-4" strokeWidth={1.8} />
                <span className="text-[0.88rem]">Aparência</span>
              </button>
            </nav>
          </div>

          {/* Painel de conteúdo direito */}
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            {/* Cabeçalho */}
            <div className="flex items-center justify-between border-b border-app-border px-6 py-4">
              <h2 className="font-display text-[1.3rem] font-semibold text-app-text">
                {activeSection === 'general' ? 'Geral' : 'Aparência'}
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-transparent p-1.5 text-app-muted transition hover:border-app-border hover:bg-app-accent-soft hover:text-app-text"
                title="Fechar"
              >
                <X className="h-5 w-5" strokeWidth={1.8} />
              </button>
            </div>

            {/* Conteúdo rolável */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {activeSection === 'general' && (
                <div className="space-y-6">
                  {/* Foto de perfil */}
                  <div>
                    <label className="block text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-app-muted mb-3">
                      Foto de perfil
                    </label>
                    <div className="flex items-center gap-4">
                      {user.avatarUrl ? (
                        <img
                          src={user.avatarUrl}
                          alt={user.name}
                          className="h-16 w-16 rounded-full object-cover border-2 border-app-border"
                        />
                      ) : (
                        <div
                          style={{
                            width: 64,
                            height: 64,
                            borderRadius: '50%',
                            background: 'var(--vt-yellow)',
                            color: 'var(--vt-ink)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            fontSize: 24,
                            flexShrink: 0,
                          }}
                        >
                          {initialOf(user.name)}
                        </div>
                      )}

                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-2">
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handlePhotoUpload}
                            className="hidden"
                          />
                          <Button
                            variant="secondary"
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={saving}
                            iconLeft={<Upload className="h-3.5 w-3.5" />}
                          >
                            {user.avatarUrl ? 'Trocar foto' : 'Enviar foto'}
                          </Button>
                          {user.avatarUrl && (
                            <Button
                              variant="ghost"
                              type="button"
                              onClick={handleRemovePhoto}
                              disabled={saving}
                              iconLeft={<Trash2 className="h-3.5 w-3.5 text-status-red" />}
                            >
                              Remover
                            </Button>
                          )}
                        </div>
                        <span className="text-[0.75rem] text-app-muted">
                          JPG, PNG ou WebP até 5 MB. Redimensionada para 128×128.
                        </span>
                        {uploadError && (
                          <span className="text-[0.75rem] text-status-red">{uploadError}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Nome e Email (não editáveis) */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-app-muted mb-1.5">
                        Nome
                      </label>
                      <input
                        type="text"
                        readOnly
                        value={user.name}
                        className="w-full rounded-xl border border-app-border bg-app-bg px-3.5 py-2.5 text-[0.88rem] text-app-text outline-none cursor-not-allowed"
                      />
                    </div>

                    <div>
                      <label className="block text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-app-muted mb-1.5">
                        E-mail
                      </label>
                      <input
                        type="text"
                        readOnly
                        value={user.email ?? '—'}
                        className="w-full rounded-xl border border-app-border bg-app-bg px-3.5 py-2.5 text-[0.88rem] text-app-text outline-none cursor-not-allowed"
                      />
                    </div>
                  </div>

                  {/* Redefinir senha */}
                  <div className="rounded-2xl border border-app-border bg-app-bg/50 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-[0.88rem] font-semibold text-app-text">
                          Senha de acesso
                        </div>
                        <div className="text-[0.78rem] text-app-muted">
                          Altere sua senha pessoal para manter sua conta protegida.
                        </div>
                      </div>
                      <Button
                        variant="secondary"
                        type="button"
                        onClick={() => setPasswordModalOpen(true)}
                        iconLeft={<KeyRound className="h-3.5 w-3.5" />}
                      >
                        Redefinir senha
                      </Button>
                    </div>
                  </div>

                  {/* Permissões */}
                  <div>
                    <label className="block text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-app-muted mb-2">
                      Permissões atribuídas
                    </label>
                    <div className="overflow-hidden rounded-2xl border border-app-border bg-app-panel shadow-soft">
                      <table className="w-full text-left text-[0.85rem]">
                        <thead className="border-b border-app-border bg-app-bg text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-app-muted">
                          <tr>
                            <th className="px-4 py-2.5">Permissão</th>
                            <th className="px-4 py-2.5">O que pode ser feito</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-app-border">
                          {user.roles && user.roles.length > 0 ? (
                            user.roles.map((role) => {
                              const def = getRoleDefinition(role);
                              return (
                                <tr key={role} className="hover:bg-app-bg/40 transition">
                                  <td className="px-4 py-3 align-top">
                                    <span
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        padding: '3px 10px',
                                        borderRadius: '9999px',
                                        background: 'var(--vt-yellow-dim)',
                                        color: 'var(--vt-yellow-ink-soft)',
                                        boxShadow: '0 0 0 1px var(--vt-yellow-light)',
                                        fontSize: '0.8rem',
                                        fontWeight: 600,
                                        lineHeight: 1.35,
                                        whiteSpace: 'nowrap',
                                      }}
                                    >
                                      {def.label}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 align-top text-app-text text-[0.85rem] leading-relaxed">
                                    {def.description}
                                  </td>
                                </tr>
                              );
                            })
                          ) : (
                            <tr>
                              <td colSpan={2} className="px-4 py-4 text-center text-app-muted">
                                Nenhuma permissão atribuída.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {activeSection === 'visual' && (
                <div className="space-y-5">
                  <div>
                    <label className="block text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-app-muted mb-1">
                      Tema da interface
                    </label>
                    <p className="text-[0.82rem] text-app-muted mb-4">
                      Escolha o modo de exibição preferido. A configuração fica salva no seu perfil.
                    </p>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      {/* Cartão Modo Claro */}
                      <button
                        type="button"
                        onClick={() => handleSelectTheme('light')}
                        className={`group relative flex flex-col rounded-2xl border p-4 text-left transition ${
                          user.theme !== 'dark'
                            ? 'border-app-accent bg-app-accent-soft/30 ring-2 ring-app-accent'
                            : 'border-app-border bg-app-panel hover:border-app-muted'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Sun className="h-5 w-5 text-status-amber" />
                            <span className="font-semibold text-[0.92rem] text-app-text">
                              Modo Claro
                            </span>
                          </div>
                          {user.theme !== 'dark' && (
                            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-app-accent text-app-ink">
                              <Check className="h-3 w-3" strokeWidth={3} />
                            </div>
                          )}
                        </div>

                        {/* Preview miniatura Claro */}
                        <div className="h-28 w-full overflow-hidden rounded-xl border border-[#E8E8EE] bg-[#FFFFFF] p-2 flex gap-1.5 shadow-sm">
                          <div className="w-12 rounded-lg bg-[#FAFAFB] border border-[#E8E8EE] p-1 flex flex-col gap-1">
                            <div className="h-2 w-2 rounded-full bg-[#FFD919]" />
                            <div className="h-1.5 w-full rounded bg-[#E8E8EE]" />
                            <div className="h-1.5 w-full rounded bg-[#FEF7DC]" />
                          </div>
                          <div className="flex-1 rounded-lg bg-[#FAFAFB] p-1.5 flex flex-col gap-1">
                            <div className="h-2 w-16 rounded bg-[#DADAE3]" />
                            <div className="h-8 w-full rounded-md bg-[#FFFFFF] border border-[#E8E8EE]" />
                          </div>
                        </div>

                        <span className="mt-3 text-[0.78rem] text-app-muted">
                          Interface clara padrão do design system V.tal Nexus.
                        </span>
                      </button>

                      {/* Cartão Modo Escuro */}
                      <button
                        type="button"
                        onClick={() => handleSelectTheme('dark')}
                        className={`group relative flex flex-col rounded-2xl border p-4 text-left transition ${
                          user.theme === 'dark'
                            ? 'border-app-accent bg-app-accent-soft/30 ring-2 ring-app-accent'
                            : 'border-app-border bg-app-panel hover:border-app-muted'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Moon className="h-5 w-5 text-status-blue" />
                            <span className="font-semibold text-[0.92rem] text-app-text">
                              Modo Escuro
                            </span>
                          </div>
                          {user.theme === 'dark' && (
                            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-app-accent text-app-ink">
                              <Check className="h-3 w-3" strokeWidth={3} />
                            </div>
                          )}
                        </div>

                        {/* Preview miniatura Escuro */}
                        <div className="h-28 w-full overflow-hidden rounded-xl border border-[#2E2F35] bg-[#181919] p-2 flex gap-1.5 shadow-sm">
                          <div className="w-12 rounded-lg bg-[#1B1C1F] border border-[#2E2F35] p-1 flex flex-col gap-1">
                            <div className="h-2 w-2 rounded-full bg-[#FFD919]" />
                            <div className="h-1.5 w-full rounded bg-[#3D3E46]" />
                            <div className="h-1.5 w-full rounded bg-[rgba(255,217,25,0.2)]" />
                          </div>
                          <div className="flex-1 rounded-lg bg-[#1B1C1F] p-1.5 flex flex-col gap-1">
                            <div className="h-2 w-16 rounded bg-[#51525C]" />
                            <div className="h-8 w-full rounded-md bg-[#1F2023] border border-[#2E2F35]" />
                          </div>
                        </div>

                        <span className="mt-3 text-[0.78rem] text-app-muted">
                          Superfícies escuras com alto contraste e redução de cansaço visual.
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <PasswordChangeModal
        isOpen={passwordModalOpen}
        onClose={() => setPasswordModalOpen(false)}
        mode="self"
        userSubtitle={user.name}
        onSubmitSelf={async (currentPassword, newPassword) => {
          await changeOwnPassword(currentPassword, newPassword);
        }}
      />
    </>
  );
}
