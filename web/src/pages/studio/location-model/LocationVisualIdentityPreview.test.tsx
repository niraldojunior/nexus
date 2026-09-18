import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LocationSpecItemIcon } from './LocationModelStudio';
import { LocationSpecDetail } from './LocationSpecDetail';
import type { LocationModelDraftSpec } from './locationModelDraft';

const customSpec: LocationModelDraftSpec = {
  localId: 'central-office',
  persistedId: 'central-office',
  code: 'CO',
  name: 'Central Office',
  category: 'Site',
  siteRole: 'network',
  lifecycleStatus: 'Active',
  specCharacteristic: [],
  allowedParentLocalIds: [],
  allowedChildLocalIds: [],
  visualIdentity: { kind: 'system', iconCode: 'CO' },
};

const defaultProps = {
  allSpecs: [customSpec],
  canEdit: false,
  isEditing: false,
  wasActiveAtBaseline: false,
  onPatch: () => undefined,
  onRemoveNew: () => undefined,
  onInactivate: () => undefined,
  onReactivate: () => undefined,
};

describe('Location Modeling visual identity previews', () => {
  it('renders a custom identity in the list as a transparent modeling glyph', () => {
    const { container } = render(<LocationSpecItemIcon spec={customSpec} />);
    const image = container.querySelector('img');

    expect(image).toHaveClass('h-4', 'w-4');
    const svg = decodeURIComponent(image?.getAttribute('src') ?? '');
    expect(svg).toContain('viewBox="0 0 24 24"');
    expect(svg).toContain('stroke="#0284c7"');
    expect(svg).not.toContain('fill="#0284c7" stroke="#ffffff"');
  });

  it('does not wrap a custom header identity in the category marker', () => {
    const { container } = render(<LocationSpecDetail spec={customSpec} {...defaultProps} />);
    const headerImage = container.querySelector('img[alt=""]');

    expect(headerImage).toHaveClass('h-5', 'w-5');
    expect(headerImage?.parentElement).not.toHaveClass('rounded-[10px]');
    expect(decodeURIComponent(headerImage?.getAttribute('src') ?? '')).toContain(
      'stroke="#0284c7"',
    );
  });

  it('keeps the category icon as fallback without a visual identity', () => {
    render(<LocationSpecItemIcon spec={{ ...customSpec, visualIdentity: undefined }} />);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(document.querySelector('svg')).toHaveClass('h-4', 'w-4');
  });
});
