import {
  Blocks,
  CreditCard,
  Globe,
  KeyRound,
  LayoutGrid,
  PlugZap,
  Search,
  Shield,
  UserCircle2,
  Wallet,
  Wrench,
  X
} from 'lucide-react'
import { SettingsSection, SettingsSectionGroup } from '../types'

interface SettingsModalProps {
  isOpen: boolean
  activeSection: SettingsSection
  sections: SettingsSectionGroup[]
  onClose: () => void
  onSelectSection: (section: SettingsSection) => void
}

const icons: Record<SettingsSection, typeof LayoutGrid> = {
  general: LayoutGrid,
  account: UserCircle2,
  privacy: Shield,
  billing: CreditCard,
  usage: Wallet,
  capabilities: Blocks,
  'claude-code': KeyRound,
  'claude-chrome': Globe,
  skills: Wrench,
  connectors: PlugZap,
  plugins: Blocks
}

export default function SettingsModal({
  isOpen,
  activeSection,
  sections,
  onClose,
  onSelectSection
}: SettingsModalProps) {
  if (!isOpen) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 p-8 backdrop-blur-[3px]">
      <div className="flex h-[780px] w-full max-w-[1440px] overflow-hidden rounded-[28px] border border-app-border bg-white shadow-modal">
        <div className="flex w-[290px] flex-col border-r border-app-border bg-app-sidebar px-4 py-5">
          <div className="mb-7">
            <label className="flex items-center gap-3 rounded-2xl border border-app-border bg-white px-4 py-3 shadow-soft">
              <Search className="h-5 w-5 text-app-muted" strokeWidth={1.8} />
              <input
                type="text"
                placeholder="Procurar"
                className="w-full border-0 bg-transparent p-0 text-[1rem] text-app-text placeholder:text-app-muted focus:outline-none focus:ring-0"
              />
            </label>
          </div>

          <div className="space-y-8 overflow-y-auto">
            {sections.map((sectionGroup) => (
              <div key={sectionGroup.title}>
                <div className="px-3 pb-3 text-[0.8rem] font-semibold uppercase tracking-[0.08em] text-app-muted">{sectionGroup.title}</div>
                <div className="space-y-1">
                  {sectionGroup.items.map((item) => {
                    const Icon = icons[item.id]
                    const active = item.id === activeSection

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onSelectSection(item.id)}
                        className={`flex w-full items-center gap-4 rounded-[18px] border px-4 py-3 text-left transition ${
                          active
                            ? 'border-app-accent-border bg-app-accent-soft text-app-text shadow-soft'
                            : 'border-transparent text-app-text hover:border-app-border hover:bg-white'
                        }`}
                      >
                        <Icon className="h-6 w-6" strokeWidth={1.8} />
                        <span className="text-[1rem] font-medium">{item.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-1 flex-col px-7 py-6">
          <div className="mb-10 flex items-center justify-between">
            <h2 className="font-display text-[2rem] font-semibold text-app-text">Habilidades</h2>

            <div className="flex items-center gap-3">
              <button type="button" className="rounded-2xl border border-transparent p-3 text-app-text transition hover:border-app-border hover:bg-app-accent-soft">
                <Search className="h-6 w-6" strokeWidth={1.8} />
              </button>
              <button
                type="button"
                className="rounded-[999px] border border-app-border bg-white px-5 py-2.5 text-[1rem] font-medium text-app-text shadow-soft transition hover:border-app-accent-border hover:bg-app-accent-soft"
              >
                Navegar
              </button>
              <button
                type="button"
                className="rounded-[999px] border border-app-accent-border bg-app-accent px-5 py-2.5 text-[1rem] font-semibold text-app-text shadow-soft transition hover:brightness-95"
              >
                Adicionar
              </button>
              <button type="button" onClick={onClose} className="rounded-2xl border border-transparent p-3 text-app-text transition hover:border-app-border hover:bg-app-accent-soft">
                <X className="h-6 w-6" strokeWidth={1.8} />
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-[20px] border border-app-border bg-white shadow-soft">
            <div className="grid grid-cols-[1.4fr_0.4fr_0.4fr] gap-6 border-b border-app-border bg-slate-50 px-5 py-4 text-[0.82rem] font-semibold uppercase tracking-[0.08em] text-app-muted">
              <div>Habilidade</div>
              <div>Última atualiz...</div>
              <div>Autor</div>
            </div>
            <div className="grid grid-cols-[1.4fr_0.4fr_0.4fr] gap-6 px-5 py-4 text-[1rem] text-app-text">
              <div>skill-creator</div>
              <div>02/07/2026</div>
              <div>Anthropic</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
