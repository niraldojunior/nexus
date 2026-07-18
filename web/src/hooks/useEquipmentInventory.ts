import { useEffect, useState } from 'react';
import { loadResourceWorkspaceSnapshot } from '../services/resourceApi';
import type { PhysicalResource } from '../services/resourceApi';

/**
 * Hook para carregar equipamentos (PhysicalResource) com localização.
 * Usa apenas recursos que têm placeId/placeType (para renderizar no mapa).
 */
export function useEquipmentInventory() {
  const [equipment, setEquipment] = useState<PhysicalResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const snapshot = await loadResourceWorkspaceSnapshot();
        // Filtrar apenas PhysicalResource com place
        const filtered = snapshot.data.resources
          .filter((r) => r['@type'] === 'PhysicalResource' && r.place?.id)
          .slice(0, 500); // Limitar a 500 para não sobrecarregar mapa
        setEquipment(filtered as PhysicalResource[]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao carregar equipamentos');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return { equipment, loading, error };
}

/**
 * Identificar tipo de equipamento a partir de resourceSpecificationId ou name.
 */
export function identifyEquipmentType(resource: PhysicalResource): string {
  const name = resource.name?.toLowerCase() || '';
  const specId = resource.resourceSpecificationId?.toLowerCase() || '';

  if (name.includes('splitter') || specId.includes('splitter')) return 'Splitter';
  if (name.includes('pole') || name.includes('poste') || specId.includes('pole')) return 'Pole';
  if (name.includes('olt') || specId.includes('olt')) return 'OLT';
  if (name.includes('ont') || specId.includes('ont')) return 'ONT';
  if (name.includes('cto') || specId.includes('cto')) return 'CTO';
  if (name.includes('cpe') || specId.includes('cpe')) return 'CPE';

  return 'Unknown';
}

/**
 * Obter cor de equipamento por tipo.
 */
export const equipmentTypeColor: Record<string, string> = {
  Splitter: '#004E89',  // Azul escuro
  Pole: '#8B7500',      // Marrom
  OLT: '#FF6B35',       // Laranja
  ONT: '#1A9E7D',       // Verde
  CTO: '#1A9E7D',       // Verde
  CPE: '#9B59B6',       // Roxo
  Unknown: '#6B7280',   // Cinza
};

/**
 * Obter label curto de equipamento por tipo.
 */
export const equipmentTypeLabel: Record<string, string> = {
  Splitter: 'SPL',
  Pole: 'POL',
  OLT: 'OLT',
  ONT: 'ONT',
  CTO: 'CTO',
  CPE: 'CPE',
  Unknown: '?',
};
