import { ChevronDown } from 'lucide-react'

export default function Breadcrumbs({ items }: { items: string[] }) {
  return (
    <div className="flex items-center gap-3 text-[0.96rem] text-app-text">
      {items.map((item, index) => (
        <div key={item} className="flex items-center gap-3">
          {index > 0 ? <span className="text-app-muted">/</span> : null}
          <span className={index === items.length - 1 ? 'font-semibold text-app-text' : 'font-medium text-app-muted'}>{item}</span>
          {index === items.length - 1 ? (
            <ChevronDown className="h-4 w-4 text-app-text" strokeWidth={1.8} />
          ) : null}
        </div>
      ))}
    </div>
  )
}
