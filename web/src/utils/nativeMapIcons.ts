import { NATIVE_MAP_ICON_NODES } from './nativeMapIconNodes';
import {
  familyColor,
  renderIconSvg,
  resourceIconFor,
  toDataUrl,
  type IconNode,
  type IconShape,
} from './resourceIcon';
import { siteKindColor } from './siteIcon';

export const NATIVE_MAP_ICON_INDUSTRIES = [
  'TELECOM',
  'DATA_CENTER',
  'ENERGY',
  'OIL_GAS',
  'LOGISTICS',
] as const;

export type NativeMapIconIndustry = (typeof NATIVE_MAP_ICON_INDUSTRIES)[number];

export const NATIVE_MAP_ICON_INDUSTRY_LABEL: Record<NativeMapIconIndustry, string> = {
  TELECOM: 'Telecom',
  DATA_CENTER: 'Data Center',
  ENERGY: 'Energia',
  OIL_GAS: 'Gás & Óleo',
  LOGISTICS: 'Logística',
};

export type NativeMapIcon = {
  code: string;
  name: string;
  industry: NativeMapIconIndustry;
  tags: readonly string[];
  glyph: string;
  node: IconNode;
  color: string;
};

type IconDefinition = Pick<NativeMapIcon, 'code' | 'name' | 'tags' | 'glyph' | 'color'> & {
  node?: IconNode;
};

const industryColor: Record<NativeMapIconIndustry, string> = {
  TELECOM: familyColor.access,
  DATA_CENTER: '#64748b',
  ENERGY: '#f59e0b',
  OIL_GAS: '#0f766e',
  LOGISTICS: '#2563eb',
};

const icon = (
  industry: NativeMapIconIndustry,
  code: string,
  name: string,
  glyph: string,
  tags: readonly string[],
  options: { color?: string; node?: IconNode } = {},
): NativeMapIcon => ({
  industry,
  code,
  name,
  glyph,
  tags,
  color: options.color ?? industryColor[industry],
  node: options.node ?? NATIVE_MAP_ICON_NODES[glyph] ?? NATIVE_MAP_ICON_NODES.box!,
});

const telecom = (
  code: string,
  name: string,
  glyph: string,
  tags: readonly string[],
  options?: { color?: string; node?: IconNode },
) => icon('TELECOM', code, name, glyph, tags, options);

const LEGACY_TELECOM_ICONS: IconDefinition[] = [
  {
    code: 'CO',
    name: 'Central Office',
    glyph: 'building-2',
    tags: ['estação', 'central', 'site'],
    color: siteKindColor.CO,
  },
  {
    code: 'POP',
    name: 'Ponto de Presença',
    glyph: 'satellite-dish',
    tags: ['pop', 'site', 'presença'],
    color: siteKindColor.POP,
  },
  {
    code: 'CTO',
    name: 'Caixa de Terminação Óptica',
    glyph: 'package',
    tags: ['cto', 'caixa', 'fibra'],
    color: siteKindColor.CTO,
  },
  {
    code: 'PI',
    name: 'Ponto de Instalação',
    glyph: 'home',
    tags: ['pi', 'cliente', 'instalação'],
    color: siteKindColor.PI,
  },
  {
    code: 'cdoe',
    name: 'CDOE externa',
    glyph: 'box',
    tags: ['cdoe', 'caixa', 'externa'],
    color: familyColor.cpe,
  },
  {
    code: 'cdoi',
    name: 'CDOI interna',
    glyph: 'door-open',
    tags: ['cdoi', 'caixa', 'interna', 'edificação'],
    color: familyColor.cpe,
  },
  {
    code: 'ceo',
    name: 'Caixa de Emenda Óptica',
    glyph: 'webhook',
    tags: ['ceo', 'emenda', 'fibra'],
    color: familyColor.transport,
  },
];

const resourceCodes = [
  'OLT',
  'Card',
  'Port',
  'ONT',
  'CPE',
  'Router',
  'Switch',
  'Rack',
  'PowerSupply',
  'Splitter',
  'DIO',
  'Pole',
  'Manhole',
  'Duct',
  'Tower',
  'RisingTube',
  'SpliceClosure',
  'OpticalNode',
  'Pedestal',
  'SupportBracket',
  'CableTunnel',
  'IronPipe',
  'AerialSpan',
  'BuriedSpan',
  'InnerSpan',
  'OtherSpan',
  'BackboneCable',
  'DistributionCable',
  'DropCable',
  'Fiber',
  'Jumper',
  'PatchCord',
  'IPAddress',
  'Prefix',
  'VLAN',
  'VLANGroup',
  'ASN',
  'RouteTarget',
  'VRF',
] as const;

const resourceTelecomIcons = resourceCodes.map((code) => {
  const resource = resourceIconFor(code);
  return telecom(code, resource.label, resource.glyph, [code, resource.label], {
    color: resource.color,
    node: resource.node,
  });
});

const TELECOM_ICON_OVERRIDES: Record<string, { glyph: string; tags?: readonly string[] }> = {
  POP: { glyph: 'satellite-dish' },
  Tower: { glyph: 'radio-tower' },
  CTO: { glyph: 'package' },
  cdoe: { glyph: 'box' },
  cdoi: { glyph: 'door-open' },
  ceo: { glyph: 'webhook' },
};

const telecomIcons: NativeMapIcon[] = [...LEGACY_TELECOM_ICONS, ...resourceTelecomIcons]
  .filter(
    (entry, index, entries) =>
      entries.findIndex((candidate) => candidate.code === entry.code) === index,
  )
  .map((entry) => {
    const override = TELECOM_ICON_OVERRIDES[entry.code];
    const glyph = override?.glyph ?? entry.glyph;
    return icon('TELECOM', entry.code, entry.name, glyph, override?.tags ?? entry.tags, {
      color: entry.color,
      node: override ? NATIVE_MAP_ICON_NODES[glyph] : entry.node,
    });
  });

const dataCenterIcons: NativeMapIcon[] = [
  icon('DATA_CENTER', 'data-center.facility', 'Data center', 'building-2', [
    'campus',
    'edificação',
    'site',
  ]),
  icon('DATA_CENTER', 'data-center.server', 'Servidor', 'server', ['compute', 'host', 'servidor']),
  icon('DATA_CENTER', 'data-center.server-rack', 'Rack de servidores', 'layers-3', [
    'rack',
    'gabinete',
  ]),
  icon('DATA_CENTER', 'data-center.storage', 'Storage', 'database', [
    'armazenamento',
    'san',
    'dados',
  ]),
  icon('DATA_CENTER', 'data-center.hard-drive', 'Disco', 'hard-drive', ['disco', 'ssd', 'hd']),
  icon('DATA_CENTER', 'data-center.switch', 'Switch de rede', 'network', [
    'switch',
    'rede',
    'leaf',
  ]),
  icon('DATA_CENTER', 'data-center.router', 'Roteador', 'router', ['router', 'rede', 'spine']),
  icon('DATA_CENTER', 'data-center.firewall', 'Firewall', 'shield-check', [
    'segurança',
    'firewall',
  ]),
  icon('DATA_CENTER', 'data-center.cpu', 'Processador', 'cpu', ['cpu', 'compute']),
  icon('DATA_CENTER', 'data-center.memory', 'Memória', 'memory-stick', ['ram', 'memória']),
  icon('DATA_CENTER', 'data-center.circuit-board', 'Placa controladora', 'circuit-board', [
    'placa',
    'controladora',
  ]),
  icon('DATA_CENTER', 'data-center.console', 'Console de operação', 'monitor', [
    'noc',
    'console',
    'monitor',
  ]),
  icon('DATA_CENTER', 'data-center.cloud', 'Cloud privada', 'cloud', ['nuvem', 'cloud']),
  icon('DATA_CENTER', 'data-center.power-distribution', 'Distribuição de energia', 'plug', [
    'pdu',
    'energia',
    'tomada',
  ]),
  icon('DATA_CENTER', 'data-center.ups', 'UPS', 'battery-charging', ['ups', 'no-break', 'bateria']),
  icon('DATA_CENTER', 'data-center.generator', 'Gerador', 'power', ['gerador', 'energia']),
  icon('DATA_CENTER', 'data-center.cooling', 'Climatização', 'snowflake', [
    'crac',
    'refrigeração',
    'ar condicionado',
  ]),
  icon('DATA_CENTER', 'data-center.fan', 'Ventilação', 'fan', ['ventilador', 'exaustão']),
  icon('DATA_CENTER', 'data-center.temperature', 'Sensor de temperatura', 'thermometer', [
    'sensor',
    'temperatura',
  ]),
  icon('DATA_CENTER', 'data-center.access-control', 'Controle de acesso', 'key-round', [
    'acesso',
    'chave',
    'segurança',
  ]),
  icon('DATA_CENTER', 'data-center.lock', 'Área segura', 'lock', ['segurança', 'cadeado']),
  icon('DATA_CENTER', 'data-center.alarm', 'Alarme', 'siren', ['alarme', 'incidente']),
  icon('DATA_CENTER', 'data-center.cabling', 'Cabeamento estruturado', 'cable', [
    'cabo',
    'fibra',
    'ethernet',
  ]),
  icon('DATA_CENTER', 'data-center.operations', 'Operação', 'server-cog', [
    'operação',
    'manutenção',
  ]),
];

const energyIcons: NativeMapIcon[] = [
  icon('ENERGY', 'energy.generation-plant', 'Usina geradora', 'factory', ['usina', 'geração']),
  icon('ENERGY', 'energy.substation', 'Subestação', 'network', ['subestação', 'transformação']),
  icon('ENERGY', 'energy.transmission-tower', 'Torre de transmissão', 'radio-tower', [
    'torre',
    'transmissão',
  ]),
  icon('ENERGY', 'energy.utility-pole', 'Poste elétrico', 'utility-pole', [
    'poste',
    'distribuição',
  ]),
  icon('ENERGY', 'energy.transformer', 'Transformador', 'repeat-2', ['transformador', 'tensão']),
  icon('ENERGY', 'energy.switchgear', 'Painel de manobra', 'circuit-board', [
    'switchgear',
    'painel',
    'manobra',
  ]),
  icon('ENERGY', 'energy.breaker', 'Disjuntor', 'power-circle', ['disjuntor', 'proteção']),
  icon('ENERGY', 'energy.meter', 'Medidor', 'gauge', ['medidor', 'consumo']),
  icon('ENERGY', 'energy.generator', 'Gerador', 'power', ['gerador', 'alternador']),
  icon('ENERGY', 'energy.battery-bank', 'Banco de baterias', 'battery', [
    'bateria',
    'armazenamento',
  ]),
  icon('ENERGY', 'energy.charger', 'Carregador', 'battery-charging', ['carregador', 'bateria']),
  icon('ENERGY', 'energy.solar-plant', 'Usina solar', 'sun', ['solar', 'fotovoltaica']),
  icon('ENERGY', 'energy.wind-farm', 'Parque eólico', 'wind', ['eólica', 'turbina']),
  icon('ENERGY', 'energy.hydroelectric', 'Usina hidrelétrica', 'droplets', [
    'hidrelétrica',
    'água',
  ]),
  icon('ENERGY', 'energy.control-center', 'Centro de operação', 'monitor', [
    'cos',
    'controle',
    'operação',
  ]),
  icon('ENERGY', 'energy.grid', 'Rede elétrica', 'workflow', ['grid', 'rede', 'malha']),
  icon('ENERGY', 'energy.feeder', 'Alimentador', 'git-branch', ['alimentador', 'circuito']),
  icon('ENERGY', 'energy.cable', 'Cabo elétrico', 'cable', ['cabo', 'condutor']),
  icon('ENERGY', 'energy.service-point', 'Ponto de entrega', 'plug', ['entrega', 'conexão']),
  icon('ENERGY', 'energy.street-light', 'Iluminação pública', 'lamp', [
    'luminária',
    'poste',
    'iluminação',
  ]),
  icon('ENERGY', 'energy.load', 'Carga elétrica', 'zap', ['carga', 'energia']),
  icon('ENERGY', 'energy.maintenance', 'Equipe de manutenção', 'wrench', ['manutenção', 'equipe']),
  icon('ENERGY', 'energy.safety-zone', 'Zona de segurança', 'shield-check', [
    'segurança',
    'proteção',
  ]),
  icon('ENERGY', 'energy.alert', 'Ocorrência elétrica', 'triangle', ['alerta', 'falha']),
];

const oilGasIcons: NativeMapIcon[] = [
  icon('OIL_GAS', 'oil-gas.field', 'Campo de produção', 'map-pin', ['campo', 'produção']),
  icon('OIL_GAS', 'oil-gas.platform', 'Plataforma offshore', 'anchor', ['plataforma', 'offshore']),
  icon('OIL_GAS', 'oil-gas.refinery', 'Refinaria', 'factory', ['refinaria', 'processamento']),
  icon('OIL_GAS', 'oil-gas.terminal', 'Terminal', 'warehouse', ['terminal', 'armazenamento']),
  icon('OIL_GAS', 'oil-gas.tank', 'Tanque', 'container', ['tanque', 'reservatório']),
  icon('OIL_GAS', 'oil-gas.pipeline', 'Duto', 'workflow', ['pipeline', 'gasoduto', 'oleoduto']),
  icon('OIL_GAS', 'oil-gas.valve', 'Válvula', 'settings', ['válvula', 'bloqueio']),
  icon('OIL_GAS', 'oil-gas.pump', 'Bomba', 'repeat-2', ['bomba', 'transferência']),
  icon('OIL_GAS', 'oil-gas.compressor', 'Compressor', 'fan', ['compressor', 'gás']),
  icon('OIL_GAS', 'oil-gas.well', 'Poço', 'droplet', ['poço', 'extração']),
  icon('OIL_GAS', 'oil-gas.flare', 'Tocha', 'flame', ['flare', 'tocha', 'queima']),
  icon('OIL_GAS', 'oil-gas.fuel-station', 'Base de abastecimento', 'fuel', [
    'combustível',
    'abastecimento',
  ]),
  icon('OIL_GAS', 'oil-gas.separator', 'Separador', 'diff', ['separador', 'processo']),
  icon('OIL_GAS', 'oil-gas.metering', 'Estação de medição', 'gauge', ['medição', 'vazão']),
  icon('OIL_GAS', 'oil-gas.control-room', 'Sala de controle', 'monitor', ['controle', 'operação']),
  icon('OIL_GAS', 'oil-gas.sensor', 'Sensor de processo', 'activity', ['sensor', 'telemetria']),
  icon('OIL_GAS', 'oil-gas.temperature', 'Temperatura de processo', 'thermometer', [
    'temperatura',
    'sensor',
  ]),
  icon('OIL_GAS', 'oil-gas.ship', 'Navio petroleiro', 'ship', ['navio', 'petroleiro']),
  icon('OIL_GAS', 'oil-gas.loading', 'Ponto de carregamento', 'truck', [
    'carregamento',
    'caminhão',
  ]),
  icon('OIL_GAS', 'oil-gas.marine-route', 'Rota marítima', 'waves', ['mar', 'rota', 'offshore']),
  icon('OIL_GAS', 'oil-gas.maintenance', 'Manutenção', 'wrench', ['manutenção', 'ferramenta']),
  icon('OIL_GAS', 'oil-gas.worksite', 'Frente de obra', 'hard-hat', ['obra', 'equipe']),
  icon('OIL_GAS', 'oil-gas.safety', 'Segurança operacional', 'shield-check', [
    'segurança',
    'integridade',
  ]),
  icon('OIL_GAS', 'oil-gas.emergency', 'Emergência', 'siren', ['emergência', 'alarme']),
];

const logisticsIcons: NativeMapIcon[] = [
  icon('LOGISTICS', 'logistics.distribution-center', 'Centro de distribuição', 'warehouse', [
    'cd',
    'armazém',
    'distribuição',
  ]),
  icon('LOGISTICS', 'logistics.warehouse', 'Armazém', 'building-2', ['galpão', 'estoque']),
  icon('LOGISTICS', 'logistics.container-yard', 'Pátio de contêineres', 'container', [
    'pátio',
    'container',
  ]),
  icon('LOGISTICS', 'logistics.inventory', 'Estoque', 'boxes', ['inventário', 'caixas']),
  icon('LOGISTICS', 'logistics.package', 'Volume', 'package', ['pacote', 'volume']),
  icon('LOGISTICS', 'logistics.receiving', 'Recebimento', 'package-open', [
    'entrada',
    'recebimento',
  ]),
  icon('LOGISTICS', 'logistics.dispatch', 'Expedição', 'package-check', ['saída', 'expedição']),
  icon('LOGISTICS', 'logistics.tracking', 'Rastreio de carga', 'package-search', [
    'rastreio',
    'tracking',
  ]),
  icon('LOGISTICS', 'logistics.barcode', 'Código de barras', 'barcode', ['barcode', 'etiqueta']),
  icon('LOGISTICS', 'logistics.scanner', 'Leitor de código', 'scan-barcode', [
    'scanner',
    'coletor',
  ]),
  icon('LOGISTICS', 'logistics.forklift', 'Empilhadeira', 'forklift', [
    'movimentação',
    'empilhadeira',
  ]),
  icon('LOGISTICS', 'logistics.truck', 'Caminhão', 'truck', ['rodoviário', 'carga']),
  icon('LOGISTICS', 'logistics.car', 'Veículo leve', 'car', ['veículo', 'frota']),
  icon('LOGISTICS', 'logistics.rail-terminal', 'Terminal ferroviário', 'train-front', [
    'trem',
    'ferrovia',
  ]),
  icon('LOGISTICS', 'logistics.port', 'Porto', 'ship', ['navio', 'porto']),
  icon('LOGISTICS', 'logistics.airport', 'Terminal aéreo', 'plane', ['avião', 'aeroporto']),
  icon('LOGISTICS', 'logistics.route', 'Rota logística', 'route', ['rota', 'percurso']),
  icon('LOGISTICS', 'logistics.delivery-point', 'Ponto de entrega', 'map-pin', [
    'entrega',
    'destino',
  ]),
  icon('LOGISTICS', 'logistics.navigation', 'Navegação de frota', 'navigation', [
    'gps',
    'navegação',
  ]),
  icon('LOGISTICS', 'logistics.parking', 'Estacionamento de frota', 'parking-circle', [
    'pátio',
    'estacionamento',
  ]),
  icon('LOGISTICS', 'logistics.checkpoint', 'Posto de controle', 'clipboard-check', [
    'controle',
    'checklist',
  ]),
  icon('LOGISTICS', 'logistics.schedule', 'Janela de entrega', 'clock', ['agenda', 'prazo']),
  icon('LOGISTICS', 'logistics.traffic-control', 'Controle de tráfego', 'traffic-cone', [
    'tráfego',
    'bloqueio',
  ]),
  icon('LOGISTICS', 'logistics.cross-docking', 'Cross-docking', 'workflow', [
    'cross docking',
    'transferência',
  ]),
];

export const NATIVE_MAP_ICONS: readonly NativeMapIcon[] = [
  ...telecomIcons,
  ...dataCenterIcons,
  ...energyIcons,
  ...oilGasIcons,
  ...logisticsIcons,
];

const iconByCode = new Map(NATIVE_MAP_ICONS.map((entry) => [entry.code.toLowerCase(), entry]));

export function nativeMapIconsForIndustry(
  industry: NativeMapIconIndustry,
): readonly NativeMapIcon[] {
  return NATIVE_MAP_ICONS.filter((entry) => entry.industry === industry);
}

export function nativeMapIconForCode(code: string | undefined): NativeMapIcon | undefined {
  return code ? iconByCode.get(code.toLowerCase()) : undefined;
}

export function filterNativeMapIcons(
  industry: NativeMapIconIndustry,
  search: string,
): readonly NativeMapIcon[] {
  const term = search.trim().toLocaleLowerCase('pt-BR');
  return nativeMapIconsForIndustry(industry).filter((entry) => {
    if (!term) return true;
    return [entry.name, entry.code, ...entry.tags]
      .join(' ')
      .toLocaleLowerCase('pt-BR')
      .includes(term);
  });
}

const dataUrlCache = new Map<string, string>();

export function nativeMapIconDataUrl(
  entry: NativeMapIcon,
  options: { size?: number; shape?: IconShape } = {},
): string {
  const key = `${entry.code}:${entry.glyph}:${entry.color}:${options.size ?? ''}:${options.shape ?? ''}`;
  const cached = dataUrlCache.get(key);
  if (cached) return cached;
  const value = toDataUrl(renderIconSvg(entry.node, entry.color, options));
  dataUrlCache.set(key, value);
  return value;
}
