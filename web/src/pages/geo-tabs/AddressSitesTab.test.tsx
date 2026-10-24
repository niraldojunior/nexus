import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AddressSitesTab } from './AddressSitesTab';

const mocks = vi.hoisted(() => ({
  getGeoSite: vi.fn(),
  listGeoSiteSpecifications: vi.fn(async () => [
    {
      id: 'spec-cd',
      code: 'CD',
      name: 'Armazem Logístico',
      category: 'Site',
      visualIdentity: { kind: 'system', iconCode: 'CO' },
    },
  ]),
}));

vi.mock('../../services/geoApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/geoApi')>()),
  getGeoSite: mocks.getGeoSite,
  listGeoSiteSpecifications: mocks.listGeoSiteSpecifications,
}));

afterEach(cleanup);

describe('AddressSitesTab', () => {
  it('mostra o ícone do tipo de local de cada Local, sem buscar o Site', async () => {
    render(
      <AddressSitesTab
        state={{
          status: 'ready',
          sites: [
            {
              id: 'site:cd-123',
              refId: 'cd-123',
              kind: 'site',
              label: 'CD 123',
              sublabel: 'Armazem Logístico',
              status: 'InConstruction',
              siteSpecificationId: 'spec-cd',
              hasChildren: false,
            },
          ],
        }}
        onSelectSite={vi.fn()}
      />,
    );

    const button = screen.getByRole('button', { name: /CD 123/ });
    await waitFor(() => expect(button.querySelector('img')).not.toBeNull());
    expect(mocks.getGeoSite).not.toHaveBeenCalled();
  });
});
