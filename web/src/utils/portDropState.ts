import type { ResourcePortDetail } from '../services/resourceApi';

export type PortDropState = {
  label: 'Drop conectado' | 'Drop desativado' | 'Conexão encerrada' | null;
  hasDisabledDrop: boolean;
};

/**
 * Distingue ocupação física de ativação do serviço: o drop pode permanecer instalado após churn.
 * `undefined` preserva a leitura de backends anteriores que ainda não enriquecem a projeção.
 */
export const portDropState = (port: ResourcePortDetail): PortDropState => {
  const hasPhysicalDrop = port.drops.some((drop) => drop.active);
  if (hasPhysicalDrop) {
    return port.hasActiveService === false
      ? { label: 'Drop desativado', hasDisabledDrop: true }
      : { label: 'Drop conectado', hasDisabledDrop: false };
  }
  if (port.drops.length > 0) return { label: 'Conexão encerrada', hasDisabledDrop: false };
  return { label: null, hasDisabledDrop: false };
};
