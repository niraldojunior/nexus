// Contrato canônico puro de Identidade Visual compartilhado entre frontend e backend.
// Sem dependências externas (React/Node/DOM) para permitir compilação idêntica em ambos os lados.

export type VisualIdentity =
  | { kind: 'system'; iconCode: string }
  | { kind: 'asset'; assetId: string };

export const NATIVE_MAP_ICON_CODES = [
  // REAL_ESTATE
  'real-estate.property',
  'real-estate.condominium',
  'real-estate.campus',
  'real-estate.building',
  'real-estate.tower-block',
  'real-estate.floor',
  'real-estate.room',
  'real-estate.unit',
  'real-estate.facility',
  'real-estate.site',
  'real-estate.subsite',
  'real-estate.operational-area',
  'real-estate.land',
  'real-estate.security-post',
  'real-estate.technical-room',
  'real-estate.rooftop',
  'real-estate.underground',
  'real-estate.parking',
  'real-estate.distribution-box',
  'real-estate.utility-area',
  'real-estate.common-area',
  'real-estate.warehouse',

  // TELECOM (Legacy + Resources)
  'CO',
  'POP',
  'CTO',
  'PI',
  'cdoe',
  'cdoi',
  'ceo',
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

  // DATA_CENTER
  'data-center.facility',
  'data-center.server',
  'data-center.server-rack',
  'data-center.storage',
  'data-center.hard-drive',
  'data-center.switch',
  'data-center.router',
  'data-center.firewall',
  'data-center.cpu',
  'data-center.memory',
  'data-center.circuit-board',
  'data-center.console',
  'data-center.cloud',
  'data-center.power-distribution',
  'data-center.ups',
  'data-center.generator',
  'data-center.cooling',
  'data-center.fan',
  'data-center.temperature',
  'data-center.access-control',
  'data-center.lock',
  'data-center.alarm',
  'data-center.cabling',
  'data-center.operations',

  // ENERGY
  'energy.generation-plant',
  'energy.substation',
  'energy.transmission-tower',
  'energy.utility-pole',
  'energy.transformer',
  'energy.switchgear',
  'energy.breaker',
  'energy.meter',
  'energy.generator',
  'energy.battery-bank',
  'energy.charger',
  'energy.solar-plant',
  'energy.wind-farm',
  'energy.hydroelectric',
  'energy.control-center',
  'energy.grid',
  'energy.feeder',
  'energy.cable',
  'energy.service-point',
  'energy.street-light',
  'energy.load',
  'energy.maintenance',
  'energy.safety-zone',
  'energy.alert',

  // OIL_GAS
  'oil-gas.field',
  'oil-gas.platform',
  'oil-gas.refinery',
  'oil-gas.terminal',
  'oil-gas.tank',
  'oil-gas.pipeline',
  'oil-gas.valve',
  'oil-gas.pump',
  'oil-gas.compressor',
  'oil-gas.well',
  'oil-gas.flare',
  'oil-gas.fuel-station',
  'oil-gas.separator',
  'oil-gas.metering',
  'oil-gas.control-room',
  'oil-gas.sensor',
  'oil-gas.temperature',
  'oil-gas.ship',
  'oil-gas.loading',
  'oil-gas.marine-route',
  'oil-gas.maintenance',
  'oil-gas.worksite',
  'oil-gas.safety',
  'oil-gas.emergency',

  // LOGISTICS
  'logistics.distribution-center',
  'logistics.warehouse',
  'logistics.container-yard',
  'logistics.inventory',
  'logistics.package',
  'logistics.receiving',
  'logistics.dispatch',
  'logistics.tracking',
  'logistics.barcode',
  'logistics.scanner',
  'logistics.forklift',
  'logistics.truck',
  'logistics.car',
  'logistics.rail-terminal',
  'logistics.port',
  'logistics.airport',
  'logistics.route',
  'logistics.delivery-point',
  'logistics.navigation',
  'logistics.parking',
  'logistics.checkpoint',
  'logistics.schedule',
  'logistics.traffic-control',
  'logistics.cross-docking',
] as const;

const NATIVE_MAP_ICON_CODE_SET = new Set(
  NATIVE_MAP_ICON_CODES.map((code) => code.toLowerCase()),
);

export function isValidNativeMapIconCode(code: string | null | undefined): boolean {
  if (!code || typeof code !== 'string') return false;
  return NATIVE_MAP_ICON_CODE_SET.has(code.trim().toLowerCase());
}

export function isVisualIdentity(value: unknown): value is VisualIdentity {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.kind === 'system') {
    return (
      candidate.assetId === undefined &&
      typeof candidate.iconCode === 'string' &&
      candidate.iconCode.trim().length > 0 &&
      isValidNativeMapIconCode(candidate.iconCode)
    );
  }
  if (candidate.kind === 'asset') {
    return (
      candidate.iconCode === undefined &&
      typeof candidate.assetId === 'string' &&
      candidate.assetId.trim().length > 0
    );
  }
  return false;
}

export function normalizeVisualIdentity(value: unknown): VisualIdentity | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (isVisualIdentity(value)) {
    if (value.kind === 'system') {
      return { kind: 'system', iconCode: value.iconCode.trim() };
    }
    return { kind: 'asset', assetId: value.assetId.trim() };
  }
  return undefined;
}
