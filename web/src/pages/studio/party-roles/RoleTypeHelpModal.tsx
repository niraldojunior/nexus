import { Modal } from '../../../components/ui';
import { PARTY_ROLE_TYPE_OPTIONS } from './partyRoleTypeOptions';

export type RoleTypeHelpModalProps = {
  onClose: () => void;
};

/** Explica o mapeamento fechado dos 8 tipos de papel — aberto pelo ícone "?" ao lado da combo
 * "Tipo" em RoleGeneralTab.tsx. Sem padrão de tooltip/help prévio no repositório: construído do
 * zero em cima do `Modal` genérico. */
export function RoleTypeHelpModal({ onClose }: RoleTypeHelpModalProps) {
  return (
    <Modal title="Tipos de papel" onClose={onClose} width={560} closeOnClickOutside>
      <div className="space-y-3">
        <p className="text-[0.82rem] text-app-muted">
          Cada papel representa uma relação de negócio entre uma organização e a infraestrutura da
          V.tal. Escolha o tipo que melhor descreve essa relação.
        </p>
        <div className="divide-y divide-app-border overflow-hidden rounded-[14px] border border-app-border">
          {PARTY_ROLE_TYPE_OPTIONS.map((option) => {
            const Icon = option.icon;
            return (
              <div key={option.value} className="flex items-start gap-3 p-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-app-accent-soft text-app-accent">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <span className="font-semibold text-app-text">{option.label}</span>
                  <p className="mt-0.5 text-[0.8rem] text-app-muted">{option.meaning}</p>
                  <p className="mt-0.5 text-[0.76rem] italic text-app-muted">Ex.: {option.example}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
