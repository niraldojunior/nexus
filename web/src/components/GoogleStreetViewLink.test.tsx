import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GoogleStreetViewLink } from './GoogleStreetViewLink';

describe('GoogleStreetViewLink', () => {
  it('renderiza um ícone com hint acima e abre o panorama em nova aba', () => {
    render(<GoogleStreetViewLink point={[-43.1108, -22.9108]} />);

    const link = screen.getByRole('link', { name: 'Abrir no Streetview' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer noopener');

    const url = new URL(link.getAttribute('href')!);
    expect(url.searchParams.get('map_action')).toBe('pano');
    expect(url.searchParams.get('viewpoint')).toBe('-22.9108,-43.1108');
    expect(screen.getByRole('tooltip')).toHaveTextContent('Streetview');
  });

  it('não renderiza o link sem coordenada válida', () => {
    const { container } = render(<GoogleStreetViewLink point={null} />);

    expect(container).toBeEmptyDOMElement();
  });
});
