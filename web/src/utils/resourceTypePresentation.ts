import { Box, Cpu, type LucideIcon } from 'lucide-react';
import type { ResourceType } from '../services/resourceApi';

export type ResourceTypePresentation = {
  name: string;
  nature?: ResourceType['nature'];
  visualIdentity?: ResourceType['visualIdentity'];
};

/**
 * Fallback visual canônico de um ResourceType sem identidade configurada. A Modelagem e o
 * inventário o compartilham para que a ausência de customização não recrie convenções por nome.
 */
export function resourceTypeFallbackIcon(nature: ResourceType['nature'] | undefined): LucideIcon {
  return nature === 'LogicalResource' ? Cpu : Box;
}

/** Cor usada pela Modelagem para o glifo genérico do tipo. */
export function resourceTypeFallbackColor(nature: ResourceType['nature'] | undefined): string {
  return nature === 'LogicalResource' ? '#9333ea' : '#0284c7';
}
