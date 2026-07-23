// Iconografia dos tipos de recurso — fonte única para a árvore de Locais e para
// os pins do mapa.
//
// A geometria dos glifos foi extraída do lucide-react já usado na UI (ISC), para
// que o ícone do pin no mapa seja exatamente o mesmo desenho do ícone na árvore.
// O Google Maps não renderiza React nem lê variáveis CSS, então o mesmo `node` é
// serializado para um SVG em data-URL em `resourceIconDataUrl`.
//
// Os códigos são os `code` do catálogo de ResourceType (TMF634) — 28 tipos em 9
// categorias. A cor vem da família (categoria), o glifo vem do tipo: assim uma
// família inteira lê como um bloco no mapa e o tipo continua distinguível.

export type ResourceFamily =
  | 'access'
  | 'cpe'
  | 'transport'
  | 'passive'
  | 'cableOsp'
  | 'cableIsp'
  | 'logical'
  | 'unknown';

// Nó de ícone no formato do lucide: [tag SVG, atributos].
export type IconNode = Array<[string, Record<string, string>]>;

export type ResourceIcon = {
  code: string;
  family: ResourceFamily;
  glyph: string;
  node: IconNode;
  color: string;
  label: string;
};

// Espelha os tokens do design system (docs/03-design-system/tokens/colors.css).
// Precisa existir em JS porque o Google Maps só aceita hex literal.
export const familyColor: Record<ResourceFamily, string> = {
  access: '#3b82f6', // --net-olt
  cpe: '#10b981', // --net-cto / --status-green
  transport: '#8b5cf6', // --net-splitter / --status-purple
  passive: '#f59e0b', // --net-poste / --status-amber
  cableOsp: '#334155', // --net-cabo
  cableIsp: '#64748b', // --slate-500
  logical: '#243041', // --vt-ink
  unknown: '#94a3b8', // --text-tertiary
};

export const familyLabel: Record<ResourceFamily, string> = {
  access: 'Equipamento de acesso',
  cpe: 'Equipamento de cliente',
  transport: 'Equipamento de transporte',
  passive: 'Infraestrutura passiva',
  cableOsp: 'Cabo (planta externa)',
  cableIsp: 'Cabo (planta interna)',
  logical: 'Recurso lógico',
  unknown: 'Tipo não identificado',
};

// Onde o recurso vive fisicamente. É o que separa o que o mapa e a árvore de
// Locais mostram (planta externa — o que existe na rua e tem coordenada própria)
// do que só faz sentido dentro do local que o contém (planta interna e
// equipamento de cliente), acessível pelo modal do local.
export type ResourcePlant = 'outdoor' | 'indoor' | 'customer' | 'logical';

export const plantLabel: Record<ResourcePlant, string> = {
  outdoor: 'Planta externa',
  indoor: 'Planta interna',
  customer: 'Equipamento de cliente',
  logical: 'Recurso lógico',
};

// A família já responde "onde isto mora" para quase todo tipo — OSP na rua,
// acesso/transporte no rack da estação, CPE na casa do assinante.
const FAMILY_PLANT: Record<ResourceFamily, ResourcePlant> = {
  access: 'indoor',
  cpe: 'customer',
  transport: 'indoor',
  passive: 'outdoor',
  cableOsp: 'outdoor',
  cableIsp: 'indoor',
  logical: 'logical',
  // Tipo não identificado continua na planta externa: num inventário, esconder o
  // que não se sabe classificar é pior do que mostrar demais.
  unknown: 'outdoor',
};

// Exceções em que o tipo contradiz a família. O DIO é infraestrutura passiva,
// mas mora no rack da estação — é planta interna.
const PLANT_BY_CODE: Record<string, ResourcePlant> = {
  DIO: 'indoor',
};

// Rótulo em português por código de tipo. Só os que divergem do próprio código.
const TYPE_LABEL: Record<string, string> = {
  OLT: 'OLT',
  Card: 'Placa / Módulo',
  Port: 'Porta',
  ONT: 'ONT',
  CPE: 'CPE',
  Router: 'Roteador',
  Switch: 'Switch',
  Rack: 'Rack',
  PowerSupply: 'Fonte de alimentação',
  Splitter: 'Splitter',
  CTO: 'CTO',
  DIO: 'DIO',
  Pole: 'Poste',
  Manhole: 'Caixa subterrânea',
  Duct: 'Duto',
  BackboneCable: 'Cabo backbone',
  DistributionCable: 'Cabo de distribuição',
  DropCable: 'Cabo drop',
  Fiber: 'Fibra',
  Jumper: 'Jumper',
  PatchCord: 'Patch cord',
  IPAddress: 'Endereço IP',
  Prefix: 'Prefixo',
  VLAN: 'VLAN',
  VLANGroup: 'Grupo de VLAN',
  ASN: 'ASN',
  RouteTarget: 'Route target',
  VRF: 'VRF',
};

const ICONS: Record<string, { family: ResourceFamily; glyph: string; node: IconNode }> = {
  OLT: { family: 'access', glyph: 'server', node: [["rect",{"width":"20","height":"8","x":"2","y":"2","rx":"2","ry":"2"}],["rect",{"width":"20","height":"8","x":"2","y":"14","rx":"2","ry":"2"}],["line",{"x1":"6","x2":"6.01","y1":"6","y2":"6"}],["line",{"x1":"6","x2":"6.01","y1":"18","y2":"18"}]] },
  Card: { family: 'access', glyph: 'circuit-board', node: [["rect",{"width":"18","height":"18","x":"3","y":"3","rx":"2"}],["path",{"d":"M11 9h4a2 2 0 0 0 2-2V3"}],["circle",{"cx":"9","cy":"9","r":"2"}],["path",{"d":"M7 21v-4a2 2 0 0 1 2-2h4"}],["circle",{"cx":"15","cy":"15","r":"2"}]] },
  Port: { family: 'access', glyph: 'plug', node: [["path",{"d":"M12 22v-5"}],["path",{"d":"M9 8V2"}],["path",{"d":"M15 8V2"}],["path",{"d":"M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"}]] },
  ONT: { family: 'cpe', glyph: 'router', node: [["rect",{"width":"20","height":"8","x":"2","y":"14","rx":"2"}],["path",{"d":"M6.01 18H6"}],["path",{"d":"M10.01 18H10"}],["path",{"d":"M15 10v4"}],["path",{"d":"M17.84 7.17a4 4 0 0 0-5.66 0"}],["path",{"d":"M20.66 4.34a8 8 0 0 0-11.31 0"}]] },
  CPE: { family: 'cpe', glyph: 'hard-drive', node: [["line",{"x1":"22","x2":"2","y1":"12","y2":"12"}],["path",{"d":"M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"}],["line",{"x1":"6","x2":"6.01","y1":"16","y2":"16"}],["line",{"x1":"10","x2":"10.01","y1":"16","y2":"16"}]] },
  Router: { family: 'transport', glyph: 'route', node: [["circle",{"cx":"6","cy":"19","r":"3"}],["path",{"d":"M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"}],["circle",{"cx":"18","cy":"5","r":"3"}]] },
  Switch: { family: 'transport', glyph: 'network', node: [["rect",{"x":"16","y":"16","width":"6","height":"6","rx":"1"}],["rect",{"x":"2","y":"16","width":"6","height":"6","rx":"1"}],["rect",{"x":"9","y":"2","width":"6","height":"6","rx":"1"}],["path",{"d":"M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"}],["path",{"d":"M12 12V8"}]] },
  Rack: { family: 'transport', glyph: 'layers-3', node: [["path",{"d":"m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"}],["path",{"d":"m6.08 9.5-3.5 1.6a1 1 0 0 0 0 1.81l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9a1 1 0 0 0 0-1.83l-3.5-1.59"}],["path",{"d":"m6.08 14.5-3.5 1.6a1 1 0 0 0 0 1.81l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9a1 1 0 0 0 0-1.83l-3.5-1.59"}]] },
  PowerSupply: { family: 'transport', glyph: 'zap', node: [["polygon",{"points":"13 2 3 14 12 14 11 22 21 10 12 10 13 2"}]] },
  Splitter: { family: 'passive', glyph: 'git-fork', node: [["circle",{"cx":"12","cy":"18","r":"3"}],["circle",{"cx":"6","cy":"6","r":"3"}],["circle",{"cx":"18","cy":"6","r":"3"}],["path",{"d":"M18 9v2c0 .6-.4 1-1 1H7c-.6 0-1-.4-1-1V9"}],["path",{"d":"M12 12v3"}]] },
  CTO: { family: 'passive', glyph: 'package', node: [["path",{"d":"m7.5 4.27 9 5.15"}],["path",{"d":"M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"}],["path",{"d":"m3.3 7 8.7 5 8.7-5"}],["path",{"d":"M12 22V12"}]] },
  DIO: { family: 'passive', glyph: 'grid-2x2', node: [["rect",{"width":"18","height":"18","x":"3","y":"3","rx":"2"}],["path",{"d":"M3 12h18"}],["path",{"d":"M12 3v18"}]] },
  Pole: { family: 'passive', glyph: 'utility-pole', node: [["path",{"d":"M12 2v20"}],["path",{"d":"M2 5h20"}],["path",{"d":"M3 3v2"}],["path",{"d":"M7 3v2"}],["path",{"d":"M17 3v2"}],["path",{"d":"M21 3v2"}],["path",{"d":"m19 5-7 7-7-7"}]] },
  Manhole: { family: 'passive', glyph: 'circle-dot', node: [["circle",{"cx":"12","cy":"12","r":"10"}],["circle",{"cx":"12","cy":"12","r":"1"}]] },
  Duct: { family: 'passive', glyph: 'waypoints', node: [["circle",{"cx":"12","cy":"4.5","r":"2.5"}],["path",{"d":"m10.2 6.3-3.9 3.9"}],["circle",{"cx":"4.5","cy":"12","r":"2.5"}],["path",{"d":"M7 12h10"}],["circle",{"cx":"19.5","cy":"12","r":"2.5"}],["path",{"d":"m13.8 17.7 3.9-3.9"}],["circle",{"cx":"12","cy":"19.5","r":"2.5"}]] },
  BackboneCable: { family: 'cableOsp', glyph: 'cable', node: [["path",{"d":"M4 9a2 2 0 0 1-2-2V5h6v2a2 2 0 0 1-2 2Z"}],["path",{"d":"M3 5V3"}],["path",{"d":"M7 5V3"}],["path",{"d":"M19 15V6.5a3.5 3.5 0 0 0-7 0v11a3.5 3.5 0 0 1-7 0V9"}],["path",{"d":"M17 21v-2"}],["path",{"d":"M21 21v-2"}],["path",{"d":"M22 19h-6v-2a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2Z"}]] },
  DistributionCable: { family: 'cableOsp', glyph: 'git-commit-horizontal', node: [["circle",{"cx":"12","cy":"12","r":"3"}],["line",{"x1":"3","x2":"9","y1":"12","y2":"12"}],["line",{"x1":"15","x2":"21","y1":"12","y2":"12"}]] },
  DropCable: { family: 'cableOsp', glyph: 'git-branch', node: [["line",{"x1":"6","x2":"6","y1":"3","y2":"15"}],["circle",{"cx":"18","cy":"6","r":"3"}],["circle",{"cx":"6","cy":"18","r":"3"}],["path",{"d":"M18 9a9 9 0 0 1-9 9"}]] },
  Fiber: { family: 'cableOsp', glyph: 'waves', node: [["path",{"d":"M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"}],["path",{"d":"M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"}],["path",{"d":"M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"}]] },
  Jumper: { family: 'cableIsp', glyph: 'unplug', node: [["path",{"d":"m19 5 3-3"}],["path",{"d":"m2 22 3-3"}],["path",{"d":"M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l-6-6-2.3 2.3a2.4 2.4 0 0 0 0 3.4Z"}],["path",{"d":"M7.5 13.5 10 11"}],["path",{"d":"M10.5 16.5 13 14"}],["path",{"d":"m12 6 6 6 2.3-2.3a2.4 2.4 0 0 0 0-3.4l-2.6-2.6a2.4 2.4 0 0 0-3.4 0Z"}]] },
  PatchCord: { family: 'cableIsp', glyph: 'link-2', node: [["path",{"d":"M9 17H7A5 5 0 0 1 7 7h2"}],["path",{"d":"M15 7h2a5 5 0 1 1 0 10h-2"}],["line",{"x1":"8","x2":"16","y1":"12","y2":"12"}]] },
  IPAddress: { family: 'logical', glyph: 'globe', node: [["circle",{"cx":"12","cy":"12","r":"10"}],["path",{"d":"M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"}],["path",{"d":"M2 12h20"}]] },
  Prefix: { family: 'logical', glyph: 'hash', node: [["line",{"x1":"4","x2":"20","y1":"9","y2":"9"}],["line",{"x1":"4","x2":"20","y1":"15","y2":"15"}],["line",{"x1":"10","x2":"8","y1":"3","y2":"21"}],["line",{"x1":"16","x2":"14","y1":"3","y2":"21"}]] },
  VLAN: { family: 'logical', glyph: 'layers', node: [["path",{"d":"m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"}],["path",{"d":"m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"}],["path",{"d":"m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"}]] },
  VLANGroup: { family: 'logical', glyph: 'share-2', node: [["circle",{"cx":"18","cy":"5","r":"3"}],["circle",{"cx":"6","cy":"12","r":"3"}],["circle",{"cx":"18","cy":"19","r":"3"}],["line",{"x1":"8.59","x2":"15.42","y1":"13.51","y2":"17.49"}],["line",{"x1":"15.41","x2":"8.59","y1":"6.51","y2":"10.49"}]] },
  ASN: { family: 'logical', glyph: 'milestone', node: [["path",{"d":"M18 6H5a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h13l4-3.5L18 6Z"}],["path",{"d":"M12 13v8"}],["path",{"d":"M12 3v3"}]] },
  RouteTarget: { family: 'logical', glyph: 'crosshair', node: [["circle",{"cx":"12","cy":"12","r":"10"}],["line",{"x1":"22","x2":"18","y1":"12","y2":"12"}],["line",{"x1":"6","x2":"2","y1":"12","y2":"12"}],["line",{"x1":"12","x2":"12","y1":"6","y2":"2"}],["line",{"x1":"12","x2":"12","y1":"22","y2":"18"}]] },
  VRF: { family: 'logical', glyph: 'split', node: [["path",{"d":"M16 3h5v5"}],["path",{"d":"M8 3H3v5"}],["path",{"d":"M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3"}],["path",{"d":"m15 9 6-6"}]] },
  __fallback: { family: 'unknown', glyph: 'box', node: [["path",{"d":"M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"}],["path",{"d":"m3.3 7 8.7 5 8.7-5"}],["path",{"d":"M12 22V12"}]] },
};

// Aliases para dados legados/importados que não usam o `code` do catálogo.
const CODE_ALIAS: Record<string, string> = {
  ont: 'ONT',
  cpe: 'CPE',
  olt: 'OLT',
  cto: 'CTO',
  dio: 'DIO',
  porta: 'Port',
  port: 'Port',
  poste: 'Pole',
  pole: 'Pole',
  splitter: 'Splitter',
  card: 'Card',
  placa: 'Card',
  rack: 'Rack',
  switch: 'Switch',
  roteador: 'Router',
  router: 'Router',
  fibra: 'Fiber',
  fiber: 'Fiber',
  jumper: 'Jumper',
  patchcord: 'PatchCord',
  vlan: 'VLAN',
  vrf: 'VRF',
};

// Aceita tanto o HierResource da árvore quanto o PhysicalResource cru do
// inventário: a referência de spec dos dois traz `id`/`@referredType`, e sem
// declará-los aqui o TypeScript recusa o objeto por "weak type detection".
export type IconResourceLike = {
  name?: string;
  resourceType?: string;
  resourceSpecification?: { id?: string; name?: string; '@referredType'?: string };
};

// Resolve o código de tipo do catálogo. `resourceType` já vem com o code em dados
// criados pelo Nexus; nome e spec são a rede de segurança para o que veio de fora.
export function resourceTypeCode(resource: IconResourceLike | string | undefined): string {
  const direct = typeof resource === 'string' ? resource : resource?.resourceType;
  if (direct && ICONS[direct]) return direct;

  const haystack = (
    typeof resource === 'string'
      ? resource
      : [resource?.resourceType, resource?.resourceSpecification?.name, resource?.name].filter(Boolean).join(' ')
  ).toLowerCase();

  if (!haystack) return '__fallback';
  // Do alias mais específico para o mais genérico, para "PatchCord" não cair em "cord".
  const alias = Object.keys(CODE_ALIAS)
    .sort((left, right) => right.length - left.length)
    .find((key) => haystack.includes(key));
  return alias ? CODE_ALIAS[alias] : '__fallback';
}

export function resourceIconFor(resource: IconResourceLike | string | undefined): ResourceIcon {
  const code = resourceTypeCode(resource);
  const entry = ICONS[code] ?? ICONS.__fallback;
  return {
    code,
    family: entry.family,
    glyph: entry.glyph,
    node: entry.node,
    color: familyColor[entry.family],
    label: TYPE_LABEL[code] ?? (code === '__fallback' ? 'Outro' : code),
  };
}

export function resourcePlant(resource: IconResourceLike | string | undefined): ResourcePlant {
  const code = resourceTypeCode(resource);
  return PLANT_BY_CODE[code] ?? FAMILY_PLANT[(ICONS[code] ?? ICONS.__fallback).family];
}

// Atalho para os dois consumidores que só querem saber se o recurso pertence ao
// mapa: os pins do Geo e a árvore de Locais.
export function isOutdoorResource(resource: IconResourceLike | string | undefined): boolean {
  return resourcePlant(resource) === 'outdoor';
}

// Forma do fundo do pin. É o que separa as duas famílias de marcador no mapa:
// recurso é círculo, local é quadrado arredondado. Assim dá para dizer "isto é um
// equipamento" e "isto é um local" sem ler a legenda.
export type IconShape = 'circle' | 'squircle' | 'none';

// Serializa o glifo num SVG completo. Usado pelo marker do Google Maps, que
// aceita `icon.url` com data-URL mas não componentes React. Compartilhado com
// `siteIcon.ts` para que local e recurso tenham exatamente o mesmo tratamento.
export function renderIconSvg(
  node: IconNode,
  color: string,
  options: { size?: number; shape?: IconShape } = {},
): string {
  const size = options.size ?? 32;
  const shape = options.shape ?? 'circle';
  const glyph = node
    .map(([tag, attrs]) => {
      const serialized = Object.entries(attrs)
        .map(([key, value]) => `${kebab(key)}="${escapeXml(value)}"`)
        .join(' ');
      return `<${tag} ${serialized}/>`;
    })
    .join('');

  // Fundo na cor da família + glifo branco por cima, para o pin manter contraste
  // sobre qualquer basemap.
  const background =
    shape === 'none'
      ? ''
      : shape === 'squircle'
        ? `<rect x="2" y="2" width="28" height="28" rx="9" fill="${color}" stroke="#ffffff" stroke-width="2"/>`
        : `<circle cx="16" cy="16" r="14" fill="${color}" stroke="#ffffff" stroke-width="2"/>`;

  const strokeColor = shape === 'none' ? color : '#ffffff';

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">`,
    background,
    `<g transform="translate(8 8) scale(0.667)" fill="none" stroke="${strokeColor}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">`,
    glyph,
    `</g></svg>`,
  ].join('');
}

export function resourceIconSvg(icon: ResourceIcon, options: { size?: number; ring?: boolean } = {}): string {
  return renderIconSvg(icon.node, icon.color, {
    size: options.size,
    shape: options.ring === false ? 'none' : 'circle',
  });
}

export function resourceIconDataUrl(icon: ResourceIcon, options?: { size?: number; ring?: boolean }): string {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(resourceIconSvg(icon, options))}`;
}

export function toDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

const kebab = (key: string): string => key.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

const escapeXml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
