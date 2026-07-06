import { ProjectCardData } from '../types'

export default function ProjectCard({ project }: { project: ProjectCardData }) {
  const isExampleCard = Boolean(project.description)

  return (
    <article
      className={`flex flex-col rounded-[18px] border border-app-border bg-app-panel shadow-soft transition hover:-translate-y-[1px] hover:border-app-accent-border ${
        isExampleCard ? 'min-h-[232px] px-6 pb-5 pt-5' : 'min-h-[236px] px-6 pb-5 pt-5'
      }`}
    >
      <div className={`flex items-center gap-3 ${isExampleCard ? 'mb-4.5' : 'mb-3'}`}>
        <h2 className="text-[1rem] font-semibold tracking-[-0.02em] text-app-text">{project.title}</h2>
        {project.badge ? (
          <span className="rounded-[999px] border border-app-accent-border bg-app-accent-soft px-3 py-1 text-[0.76rem] font-semibold uppercase tracking-[0.04em] text-app-text">
            {project.badge}
          </span>
        ) : null}
      </div>

      {project.description ? (
        <p className="max-w-[48ch] text-[0.94rem] leading-[1.55] text-app-muted">{project.description}</p>
      ) : (
        <div className="flex-1" />
      )}

      <div className="mt-auto pt-6 text-[0.86rem] font-medium uppercase tracking-[0.05em] text-app-muted">{project.updatedAt}</div>
    </article>
  )
}
