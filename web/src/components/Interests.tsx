import { Plus, Sparkles, X } from 'lucide-react'
import { useState } from 'react'

type InterestTone = {
  bg: string
  text: string
  border: string
}

const tones: InterestTone[] = [
  { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200' },
  { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' },
  { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
  { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' },
  { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' }
]

type InterestItem = {
  id: number
  title: string
  tone: InterestTone
}

export default function Interests() {
  const [interests, setInterests] = useState<InterestItem[]>([
    { id: 1, title: 'Inteligência Artificial', tone: tones[0] },
    { id: 2, title: 'Programação Web', tone: tones[4] },
    { id: 3, title: 'Data Science', tone: tones[1] },
    { id: 4, title: 'Machine Learning', tone: tones[2] },
    { id: 5, title: 'Design UX/UI', tone: tones[3] },
    { id: 6, title: 'DevOps', tone: tones[5] }
  ])
  const [newInterest, setNewInterest] = useState('')

  const addInterest = () => {
    if (!newInterest.trim()) {
      return
    }

    const tone = tones[Math.floor(Math.random() * tones.length)]

    setInterests((current) => [
      ...current,
      {
        id: Date.now(),
        title: newInterest,
        tone
      }
    ])
    setNewInterest('')
  }

  const removeInterest = (id: number) => {
    setInterests((current) => current.filter((interest) => interest.id !== id))
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-app-border px-6 py-4">
        <h1 className="font-display text-2xl font-semibold text-app-text">Tópicos de Interesse</h1>
        <p className="mt-1 text-sm text-app-muted">
          Personalize seus tópicos favoritos para conversas personalizadas
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-2xl">
          <div className="mb-8 rounded-[20px] border border-app-border bg-white p-6 shadow-soft">
            <label className="mb-3 block text-sm font-semibold text-app-text">
              Adicionar novo tópico
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newInterest}
                onChange={(e) => setNewInterest(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addInterest()}
                placeholder="Ex: Machine Learning, Web Development..."
                className="flex-1 rounded-[16px] border border-app-border bg-app-panel px-4 py-3 text-app-text placeholder:text-app-muted focus:border-app-focus focus:outline-none"
              />
              <button
                onClick={addInterest}
                className="flex items-center gap-2 rounded-[16px] border border-app-accent-border bg-app-accent px-4 py-3 font-semibold text-app-text shadow-soft transition hover:brightness-95"
              >
                <Plus size={18} />
              </button>
            </div>
          </div>

          <div>
            <h2 className="mb-4 text-lg font-semibold text-app-text">Seus Tópicos</h2>
            <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {interests.map((interest) => (
                <div
                  key={interest.id}
                  className={`${interest.tone.bg} ${interest.tone.text} ${interest.tone.border} flex items-center justify-between rounded-[18px] border p-4 transition hover:-translate-y-[1px]`}
                >
                  <div className="flex items-center gap-2">
                    <Sparkles size={18} />
                    <span className="font-medium">{interest.title}</span>
                  </div>
                  <button
                    onClick={() => removeInterest(interest.id)}
                    className="rounded-full p-1 transition hover:bg-white/60"
                  >
                    <X size={18} />
                  </button>
                </div>
              ))}
            </div>

            <div className="rounded-[20px] border border-app-border bg-white p-6 shadow-soft">
              <h3 className="mb-4 text-lg font-semibold text-app-text">Tópicos Sugeridos</h3>
              <div className="space-y-3">
                {[
                  { title: 'Produtividade', description: 'Dicas para aumentar produtividade' },
                  { title: 'Educação', description: 'Aprendizado e desenvolvimento pessoal' },
                  { title: 'Saúde', description: 'Bem-estar e exercício' },
                  { title: 'Tecnologia', description: 'Últimas novidades em tech' }
                ].map((suggestion, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between rounded-[16px] border border-transparent p-3 transition hover:border-app-border hover:bg-slate-50"
                  >
                    <div>
                      <p className="font-medium text-app-text">{suggestion.title}</p>
                      <p className="text-sm text-app-muted">{suggestion.description}</p>
                    </div>
                    <button className="rounded-full border border-app-accent-border bg-app-accent-soft p-2 text-app-text transition hover:bg-app-accent">
                      <Plus size={18} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
