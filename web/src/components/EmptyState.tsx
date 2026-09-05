import ArtifactsIllustration from './ArtifactsIllustration';
import Button from './ui/Button';

interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export default function EmptyState({ title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="vt-card flex min-h-[360px] flex-col items-center justify-center px-8 text-center">
      <ArtifactsIllustration className="mb-8 h-[120px] w-[140px] text-app-text" />

      <h2 style={{ font: 'var(--text-h2)', letterSpacing: 'var(--tracking-snug)', color: 'var(--text-primary)' }}>
        {title}
      </h2>
      <p className="mt-3 max-w-[520px]" style={{ fontSize: 'var(--fs-body-relaxed)', color: 'var(--text-tertiary)' }}>
        {description}
      </p>

      {actionLabel && (
        <Button variant="primary" size="lg" style={{ marginTop: 24 }} onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
