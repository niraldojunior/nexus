import { Award, BarChart3, MessageSquare, TrendingUp } from 'lucide-react'

export default function Statistics() {
  const stats = [
    {
      icon: MessageSquare,
      label: 'Mensagens Enviadas',
      value: '1,247',
      change: '+12% esta semana'
    },
    {
      icon: TrendingUp,
      label: 'Tópicos Explorados',
      value: '24',
      change: '+3 novos'
    },
    {
      icon: Award,
      label: 'Respostas Úteis',
      value: '89%',
      change: '+5% em relação ao mês anterior'
    },
    {
      icon: BarChart3,
      label: 'Tempo Médio de Conversa',
      value: '12 min',
      change: 'Aumentou em +2 min'
    }
  ]

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-app-border px-6 py-4">
        <h1 className="font-display text-2xl font-semibold text-app-text">Suas Estatísticas</h1>
        <p className="mt-1 text-sm text-app-muted">Veja como você está usando o Nexus</p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-4xl">
          <div className="mb-12 grid grid-cols-1 gap-6 md:grid-cols-2">
            {stats.map((stat, index) => {
              const Icon = stat.icon

              return (
                <div
                  key={index}
                  className="rounded-[20px] border border-app-border bg-white p-6 shadow-soft transition hover:border-app-accent-border"
                >
                  <div className="mb-4 flex items-start justify-between">
                    <div className="rounded-[16px] border border-app-accent-border bg-app-accent-soft p-3">
                      <Icon size={24} className="text-app-text" />
                    </div>
                  </div>
                  <p className="mb-1 text-sm font-medium text-app-muted">{stat.label}</p>
                  <p className="mb-2 text-3xl font-bold text-app-text">{stat.value}</p>
                  <p className="text-xs font-medium uppercase tracking-[0.04em] text-app-muted">
                    {stat.change}
                  </p>
                </div>
              )
            })}
          </div>

          <div className="rounded-[20px] border border-app-border bg-white p-6 shadow-soft">
            <h2 className="mb-6 text-lg font-semibold text-app-text">Atividade por Hora</h2>
            <div className="space-y-4">
              {[
                { hour: '00:00', activity: 2, width: '10%' },
                { hour: '04:00', activity: 5, width: '25%' },
                { hour: '08:00', activity: 12, width: '60%' },
                { hour: '12:00', activity: 18, width: '90%' },
                { hour: '16:00', activity: 15, width: '75%' },
                { hour: '20:00', activity: 8, width: '40%' }
              ].map((item, index) => (
                <div key={index}>
                  <div className="mb-1 flex justify-between">
                    <span className="text-sm text-app-muted">{item.hour}</span>
                    <span className="text-sm font-medium text-app-text">
                      {item.activity} interações
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-100">
                    <div
                      className="h-2 rounded-full bg-app-accent transition-all"
                      style={{ width: item.width }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
