import { useEffect, useState } from 'react';
import { listResourceSpecifications } from '../services/resourceApi';
import type { ResourceSpecification } from '../services/resourceApi';

type EquipmentKind = 'Splitter' | 'Pole' | 'OLT' | 'ONT' | 'CTO' | 'CPE';

/**
 * Hook para carregar especificações de equipamentos disponíveis.
 * Filtra por categorias de infraestrutura passiva e equipamentos.
 */
export function useEquipmentCatalog() {
  const [equipment, setEquipment] = useState<ResourceSpecification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const specs = await listResourceSpecifications();
        // Filtrar apenas equipamentos de planta externa (splitter, poste, etc.)
        const filtered = specs.filter((spec) => {
          const cat = spec.category.toLowerCase();
          return (
            cat.includes('infrastructure.passive') ||
            cat.includes('equipment.access') ||
            (spec.resourceType && ['Splitter', 'Pole', 'OLT', 'ONT', 'CTO', 'CPE'].includes(spec.resourceType))
          );
        });
        setEquipment(filtered);
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
 * Mapear tipo de equipamento para rótulo amigável e cores
 */
export const equipmentKindLabel: Record<string, string> = {
  Splitter: 'Divisor Óptico',
  Pole: 'Poste',
  OLT: 'Terminal de Linha Óptica',
  ONT: 'Terminal de Rede Óptica',
  CTO: 'Terminal de Conexão Óptica',
  CPE: 'Equipamento de Cliente',
};

export const equipmentKindDescription: Record<string, string> = {
  Splitter: 'Dispositivo passivo que divide sinal óptico',
  Pole: 'Estrutura de suporte para cabos e equipamentos',
  OLT: 'Equipamento de acesso óptico na central',
  ONT: 'Terminal na residência do cliente',
  CTO: 'Armário de término na via pública',
  CPE: 'Equipamento instalado na casa do cliente',
};

/**
 * Cores por tipo de equipamento (element-class colors)
 */
export const equipmentKindColor: Record<string, string> = {
  Splitter: '#004E89',   // Azul escuro
  Pole: '#8B7500',       // Marrom
  OLT: '#FF6B35',        // Laranja
  ONT: '#1A9E7D',        // Verde
  CTO: '#1A9E7D',        // Verde
  CPE: '#9B59B6',        // Roxo
};
