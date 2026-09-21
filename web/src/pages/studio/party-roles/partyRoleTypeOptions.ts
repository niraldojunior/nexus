// Catálogo fechado dos 8 tipos de negócio de PartyRoleType (issue de UX Studio > Papéis) — fonte
// única de verdade reusada pela combo "Tipo" (RoleGeneralTab), pelo modal de ajuda
// (RoleTypeHelpModal), pelo ícone dinâmico da lista mestra (RolesPage) e pelos chips de filtro
// (RoleTypeFilterChips). `meaning`/`example` reproduzem literalmente a tabela de referência do
// usuário — não inventar texto novo aqui.
import {
  BadgeCheck,
  Building2,
  Factory,
  Headphones,
  HeartHandshake,
  Package,
  Puzzle,
  Settings2,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

export type PartyRoleTypeOption = {
  /** roleName gravado (também usado como `key`, ver RoleGeneralTab.tsx). */
  value: string;
  label: string;
  icon: LucideIcon;
  meaning: string;
  example: string;
};

export const PARTY_ROLE_TYPE_OPTIONS: PartyRoleTypeOption[] = [
  {
    value: 'manufacturer',
    label: 'Fabricante',
    icon: Factory,
    meaning: 'Quem fabrica o recurso/equipamento',
    example: 'Nokia fabrica OLT',
  },
  {
    value: 'supplier',
    label: 'Fornecedor',
    icon: Package,
    meaning: 'Quem fornece comercialmente recurso/material',
    example: 'Distribuidor fornece ONT',
  },
  {
    value: 'maintainer',
    label: 'Mantenedor',
    icon: Wrench,
    meaning: 'Responsável pela manutenção',
    example: 'Empresa mantém geradores',
  },
  {
    value: 'infrastructure_owner',
    label: 'Proprietário',
    icon: Building2,
    meaning: 'Dono jurídico/econômico da infraestrutura',
    example: 'Empresa dona do poste',
  },
  {
    value: 'operator',
    label: 'Operador',
    icon: Settings2,
    meaning: 'Quem opera tecnicamente a infraestrutura',
    example: 'V.tal opera determinada rede',
  },
  {
    value: 'system_integrator',
    label: 'Integrador',
    icon: Puzzle,
    meaning: 'Empresa responsável por integração/implantação',
    example: 'Integrador instala solução DWDM',
  },
  {
    value: 'partner',
    label: 'Parceiro',
    icon: HeartHandshake,
    meaning: 'Relação ampla de parceria que não cabe nos anteriores',
    example: 'Parceiro tecnológico',
  },
  {
    value: 'service_provider',
    label: 'Prestador de Serviço',
    icon: Headphones,
    meaning: 'Organização que presta um serviço operacional',
    example: 'Empresa de construção/field service',
  },
];

const OPTIONS_BY_VALUE = new Map(PARTY_ROLE_TYPE_OPTIONS.map((option) => [option.value, option]));

export function partyRoleTypeLabel(roleName: string): string {
  return OPTIONS_BY_VALUE.get(roleName)?.label ?? roleName;
}

export function partyRoleTypeIcon(roleName: string): LucideIcon {
  return OPTIONS_BY_VALUE.get(roleName)?.icon ?? BadgeCheck;
}
