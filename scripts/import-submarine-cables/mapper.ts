/**
 * Conversão dos placemarks KML de cabos submarinos para o modelo Nexus.
 *
 * Puro (sem I/O): recebe os `KmlDocument` já lidos e devolve rotas, sítios e descartes. Os ids são
 * UUID v5 de um namespace próprio — disjunto do seed DEMO —, então reimportar os mesmos arquivos
 * cai nas mesmas linhas (MERGE idempotente), nunca em duplicatas.
 */

import {
  deterministicUuid,
  originCharacteristics,
  type Characteristic,
  type LineString,
  type MappedLine,
  type MappedPointSite,
} from '../seed-demo-infrastructure/mapper.js';
import type { Coordinate, KmlDocument, KmlPlacemark } from './kml.js';

/** Namespace UUID v5 dos ids desta importação. Nunca mude: mudaria todos os ids já carregados. */
export const SUBMARINE_NAMESPACE = '8b2e4d71-5c39-4f0a-9e6b-1d7a3c5f2e90';

export const ORIGIN_SYSTEM = 'KML_CABOS_SUBMARINOS';

export const SUBMARINE_CABLE_RESOURCE_TYPE_CODE = 'SubmarineCable';
export const BRANCHING_UNIT_RESOURCE_TYPE_CODE = 'SubmarineBranchingUnit';
export const REPEATER_RESOURCE_TYPE_CODE = 'SubmarineRepeater';
export const EQUALIZER_RESOURCE_TYPE_CODE = 'SubmarineEqualizer';

export const BMH_SITE_SPEC_CODE = 'SUBMARINE_BMH';
export const BRANCHING_UNIT_SITE_SPEC_CODE = 'SUBMARINE_BU';
export const REPEATER_SITE_SPEC_CODE = 'SUBMARINE_REPEATER';
export const EQUALIZER_SITE_SPEC_CODE = 'SUBMARINE_EQUALIZER';

export type CableSystem = 'Malbec' | 'GlobeNet';

/** Equipamentos pontuais carregados. Cada um tem site spec e, exceto o BMH, resource type. */
export type PointEntity = 'BMH' | 'BU' | 'REPEATER' | 'EQUALIZER';

export const POINT_ENTITIES: readonly PointEntity[] = ['BMH', 'BU', 'REPEATER', 'EQUALIZER'];

/** Pasta Malbec `Waypoints - <tipo>` → entidade carregada. Pasta fora daqui é descartada. */
const WAYPOINT_FOLDERS: Record<string, PointEntity> = {
  bmh: 'BMH',
  bu: 'BU',
  repeaters: 'REPEATER',
  equalisers: 'EQUALIZER',
  equalizers: 'EQUALIZER',
};

const POINT_NAME_PREFIX: Record<PointEntity, string> = {
  BMH: '',
  BU: '',
  REPEATER: 'Repetidor ',
  EQUALIZER: 'Equalizador ',
};

/** Pasta do SEGMENT 4 com o tipo de armadura por vértice (DA/SA/SAL/LWP/LW). */
const CABLE_TYPE_FOLDER = 'cabletype';

// ---------------------------------------------------------------------------
// Metadados do arquivo
// ---------------------------------------------------------------------------

export type FileInfo = {
  system: CableSystem;
  /** Ex.: `SEG1.1`, `Segment 6`. */
  segment: string;
  pontaA?: string | undefined;
  pontaB?: string | undefined;
  /** Ex.: `PL01 21-FEB-2020` (Malbec). */
  planRevision?: string | undefined;
  /** Ex.: `White` (GlobeNet). */
  color?: string | undefined;
  /** Ex.: `Post Repair` (GlobeNet SEGMENT 4). */
  note?: string | undefined;
};

/** Abreviações de cidades usadas nos nomes de arquivo. */
const PLACE_ALIASES: Record<string, string> = {
  RIO: 'Rio de Janeiro',
  MQTA: 'Maiquetía',
  MAIQUETIA: 'Maiquetía',
  STUB_END: 'Stub End',
};

const titleCase = (value: string): string =>
  value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) =>
      ['de', 'da', 'do', 'das', 'dos'].includes(word)
        ? word
        : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(' ');

/** `BMH_LAS_TONINAS` → `BMH Las Toninas`; `BU1` fica como está; `RIO` → `Rio de Janeiro`. */
function normalizePlace(raw: string): string {
  const trimmed = raw.trim();
  const alias = PLACE_ALIASES[trimmed.toUpperCase()];
  if (alias) return alias;
  const bmh = /^BMH[_ ](.+)$/i.exec(trimmed);
  if (bmh?.[1]) return `BMH ${normalizePlace(bmh[1])}`;
  if (/^BU\d*$/i.test(trimmed)) return trimmed.toUpperCase();
  return titleCase(trimmed.replace(/_/g, ' '));
}

/**
 * Lê sistema, segmento e pontas do nome do arquivo.
 *
 * Três convenções convivem na pasta:
 * - `MALBEC_SEG1.1_BMH_RIO-BU1_PL01_21-FEB-2020.kml`
 * - `SEGMENT 6 WHITE - FORTALEZA - RIO DE JANEIRO.kmz` (e `SEGUIMENT 3 - …`, com erro de grafia)
 * - `SEG02-MQTA-BU-BARRANQUILLA.kmz`
 */
export function parseFileName(file: string): FileInfo {
  const stem = file
    .replace(/\.(kml|kmz)$/i, '')
    .replace(/\s*\(\d+\)\s*$/, '')
    .trim();

  const malbec = /^MALBEC_(SEG[\d.]+)_(.+?)-(.+?)_(PL\d+)_(\d{2}-[A-Z]{3}-\d{4})$/i.exec(stem);
  if (malbec) {
    const [, segment = '', from = '', to = '', plan = '', date = ''] = malbec;
    return {
      system: 'Malbec',
      segment: segment.toUpperCase(),
      pontaA: normalizePlace(from),
      pontaB: normalizePlace(to),
      planRevision: `${plan.toUpperCase()} ${date.toUpperCase()}`,
    };
  }

  // A cor, quando há, vem entre o número e o primeiro hífen ("SEGMENT 6 WHITE - …"); "Post Repair"
  // vem depois das pontas.
  const globeNet = /^SEGU?I?MENT\s+([\d.]+)\s*([^-]*?)\s*-\s*(.*)$/i.exec(stem);
  if (globeNet) {
    const [, number = '', rawColor = '', rest = ''] = globeNet;
    const parts = rest
      .split(/\s+-\s+|-(?=[A-Z])/)
      .map((part) => part.trim())
      .filter(Boolean);
    const color = rawColor ? titleCase(rawColor) : undefined;
    let note: string | undefined;
    const last = parts[parts.length - 1];
    if (last && /repair/i.test(last)) {
      note = titleCase(last);
      parts.pop();
    }
    return {
      system: 'GlobeNet',
      segment: `Segment ${number}`,
      pontaA: parts[0] ? normalizePlace(parts[0]) : undefined,
      pontaB: parts.length > 1 ? normalizePlace(parts[parts.length - 1] ?? '') : undefined,
      ...(color ? { color } : {}),
      ...(note ? { note } : {}),
    };
  }

  const compact = /^SEG(\d+)-(.+)$/i.exec(stem);
  if (compact) {
    const [, number = '', rest = ''] = compact;
    const parts = rest.split('-').filter(Boolean);
    return {
      system: 'GlobeNet',
      segment: `Segment ${Number(number)}`,
      pontaA: parts[0] ? normalizePlace(parts[0]) : undefined,
      pontaB: parts.length > 1 ? normalizePlace(parts[parts.length - 1] ?? '') : undefined,
    };
  }

  return { system: /^MALBEC/i.test(stem) ? 'Malbec' : 'GlobeNet', segment: stem };
}

// ---------------------------------------------------------------------------
// Geometria
// ---------------------------------------------------------------------------

const sameCoordinate = (left: Coordinate, right: Coordinate): boolean =>
  Math.abs(left[0] - right[0]) < 1e-9 && Math.abs(left[1] - right[1]) < 1e-9;

/** Remove vértices consecutivos repetidos (o KML Malbec repete o primeiro vértice). */
export function dedupeConsecutive(coordinates: readonly Coordinate[]): Coordinate[] {
  const result: Coordinate[] = [];
  for (const coordinate of coordinates) {
    const previous = result[result.length - 1];
    if (!previous || !sameCoordinate(previous, coordinate)) result.push(coordinate);
  }
  return result;
}

/**
 * Costura trechos encadeados (fim de um = início do seguinte) numa única polilinha.
 *
 * O SEGMENT 4 vem como 492 placemarks de 2 pontos contíguos. Um trecho que não encadeia abre uma
 * nova parte — nunca se inventa geometria para fechar a lacuna.
 */
export function stitchSegments(segments: readonly Coordinate[][]): Coordinate[][] {
  const parts: Coordinate[][] = [];
  for (const segment of segments) {
    const current = parts[parts.length - 1];
    const tail = current?.[current.length - 1];
    const head = segment[0];
    if (current && tail && head && sameCoordinate(tail, head)) current.push(...segment.slice(1));
    else parts.push([...segment]);
  }
  return parts;
}

const EARTH_RADIUS_KM = 6371.0088;

/** Comprimento geodésico (haversine) em km. */
export function lengthKm(coordinates: readonly Coordinate[]): number {
  let total = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    const [lon1, lat1] = coordinates[index - 1]!;
    const [lon2, lat2] = coordinates[index]!;
    const toRad = (degrees: number): number => (degrees * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    total += 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
  }
  return Math.round(total * 100) / 100;
}

// ---------------------------------------------------------------------------
// Conversão
// ---------------------------------------------------------------------------

export type MappedPoint = MappedPointSite & { entity: PointEntity; system: CableSystem };

export type ConversionReport = {
  file: string;
  system: CableSystem;
  routes: number;
  points: Partial<Record<PointEntity, number>>;
  /** Placemarks descartados por pasta (waypoints de navegação/levantamento). */
  discarded: Record<string, number>;
};

export type Conversion = {
  routes: MappedLine[];
  /** Já deduplicados por sistema + entidade + nome. */
  points: MappedPoint[];
  reports: ConversionReport[];
  /** Mesmo ponto lógico com coordenadas divergentes entre arquivos (fica a primeira ocorrência). */
  conflicts: string[];
};

const submarineId = (kind: string, key: string): string =>
  deterministicUuid(SUBMARINE_NAMESPACE, `${kind}:${key}`);

const text = (name: string, value: string): Characteristic => ({
  name,
  value,
  valueType: 'string',
});

function fileCharacteristics(info: FileInfo): Characteristic[] {
  return [
    text('sistema', info.system),
    text('segmento', info.segment),
    ...(info.pontaA ? [text('pontaA', info.pontaA)] : []),
    ...(info.pontaB ? [text('pontaB', info.pontaB)] : []),
    ...(info.planRevision ? [text('revisaoPlano', info.planRevision)] : []),
    ...(info.color ? [text('corSegmento', info.color)] : []),
    ...(info.note ? [text('observacao', info.note)] : []),
  ];
}

const routeLabel = (info: FileInfo): string => {
  const ends = info.pontaA && info.pontaB ? ` — ${info.pontaA} ↔ ${info.pontaB}` : '';
  return `${info.system} ${info.segment}${ends}`;
};

/** Pasta de waypoint Malbec → entidade, ou `undefined` se for uma pasta descartada. */
export function classifyFolder(folderPath: readonly string[]): PointEntity | undefined {
  const leaf = folderPath[folderPath.length - 1] ?? '';
  const waypoint = /^Waypoints\s*-\s*(.+)$/i.exec(leaf.trim());
  if (!waypoint?.[1]) return undefined;
  return WAYPOINT_FOLDERS[waypoint[1].trim().toLowerCase()];
}

/** Rota "terrestre" quando o nome do placemark indica trecho em terra (ex.: `Seg 6 Land Route`). */
const isLandRoute = (name: string): boolean => /\bland\b/i.test(name);

function convertRoutes(
  document: KmlDocument,
  info: FileInfo,
  report: ConversionReport,
): MappedLine[] {
  const lines = document.placemarks.filter((placemark) => placemark.kind === 'line');
  const cableTypes = [
    ...new Set(
      document.placemarks
        .filter(
          (placemark) =>
            placemark.kind === 'point' &&
            placemark.folderPath.some((folder) => folder.toLowerCase() === CABLE_TYPE_FOLDER),
        )
        .map((placemark) => placemark.name)
        .filter(Boolean),
    ),
  ].sort();

  // Placemarks sem nome são trechos de uma mesma rota (SEGMENT 4): costurados juntos, pela ordem
  // do arquivo. Os nomeados são rotas próprias.
  const groups = new Map<string, KmlPlacemark[]>();
  for (const line of lines) {
    const key = line.name || 'Route';
    const group = groups.get(key) ?? [];
    group.push(line);
    groups.set(key, group);
  }

  const routes: MappedLine[] = [];
  // Só desambigua o nome quando o arquivo traz mais de uma rota submarina; o trecho terrestre
  // sempre recebe o sufixo próprio.
  const submarineGroups = [...groups.keys()].filter((name) => !isLandRoute(name)).length;
  for (const [placemarkName, placemarks] of groups) {
    const parts = stitchSegments(placemarks.map((placemark) => placemark.coordinates))
      .map(dedupeConsecutive)
      .filter((coordinates) => coordinates.length >= 2);
    const land = isLandRoute(placemarkName);
    for (const [index, coordinates] of parts.entries()) {
      const part = parts.length > 1 ? index + 1 : undefined;
      const sourceId = `${document.file}#${placemarkName}${part === undefined ? '' : `:${part}`}`;
      const line: LineString = { type: 'LineString', coordinates };
      let name = routeLabel(info);
      if (land) name += ' (trecho terrestre)';
      else if (submarineGroups > 1) name += ` (${placemarkName})`;
      if (part !== undefined) name += ` (parte ${part})`;
      routes.push({
        sourceId,
        originId: sourceId,
        locationId: submarineId('ROUTE:LOCATION', sourceId),
        resourceId: submarineId('ROUTE:RESOURCE', sourceId),
        name,
        line,
        originSystem: ORIGIN_SYSTEM,
        characteristics: [
          ...fileCharacteristics(info),
          text('ambiente', land ? 'terrestre' : 'submarino'),
          { name: 'extensaoKm', value: lengthKm(coordinates), valueType: 'number' },
          ...(cableTypes.length > 0 ? [text('tiposCabo', cableTypes.join(', '))] : []),
          ...originCharacteristics(
            'ROUTE',
            sourceId,
            { file: document.file, placemark: placemarkName, vertices: coordinates.length },
            ORIGIN_SYSTEM,
          ),
        ],
      });
    }
  }
  report.routes = routes.length;
  return routes;
}

/** Converte todos os documentos lidos. A ordem dos documentos define a "primeira ocorrência". */
export function convertDocuments(documents: readonly KmlDocument[]): Conversion {
  const routes: MappedLine[] = [];
  const pointsByKey = new Map<string, MappedPoint>();
  const reports: ConversionReport[] = [];
  const conflicts: string[] = [];

  for (const document of documents) {
    const info = parseFileName(document.file);
    const report: ConversionReport = {
      file: document.file,
      system: info.system,
      routes: 0,
      points: {},
      discarded: {},
    };
    routes.push(...convertRoutes(document, info, report));

    for (const placemark of document.placemarks) {
      if (placemark.kind !== 'point') continue;
      const entity = classifyFolder(placemark.folderPath);
      const coordinate = placemark.coordinates[0];
      if (!entity || !coordinate || !placemark.name) {
        const folder = placemark.folderPath[placemark.folderPath.length - 1] || '(raiz)';
        report.discarded[folder] = (report.discarded[folder] ?? 0) + 1;
        continue;
      }
      report.points[entity] = (report.points[entity] ?? 0) + 1;

      // BU1/BU2 aparecem em vários segmentos: a chave é sistema + entidade + nome, não o arquivo.
      const sourceId = `${info.system}:${entity}:${placemark.name}`;
      const existing = pointsByKey.get(sourceId);
      if (existing) {
        if (!sameCoordinate(existing.point.coordinates, coordinate)) {
          conflicts.push(
            `${sourceId}: ${document.file} diverge de ${existing.point.coordinates.join(',')}`,
          );
        }
        continue;
      }
      // BMH vem em caixa alta ("BMH RIO DE JANEIRO"): mesmo tratamento das pontas da rota, para os
      // dois nomes casarem na tela. Os demais são códigos (R1104, BU1, SEQ) e ficam como estão.
      const label = entity === 'BMH' ? normalizePlace(placemark.name) : placemark.name;
      const name = `${info.system} ${POINT_NAME_PREFIX[entity]}${label}`;
      const folder = placemark.folderPath[placemark.folderPath.length - 1] ?? '';
      pointsByKey.set(sourceId, {
        entity,
        system: info.system,
        sourceId,
        locationId: submarineId(`${entity}:LOCATION`, sourceId),
        siteId: submarineId(`${entity}:SITE`, sourceId),
        resourceId: submarineId(`${entity}:RESOURCE`, sourceId),
        name,
        point: { type: 'Point', coordinates: [coordinate[0], coordinate[1]] },
        originSystem: ORIGIN_SYSTEM,
        characteristics: [
          text('sistema', info.system),
          text('segmento', info.segment),
          ...originCharacteristics(
            entity,
            sourceId,
            { file: document.file, folder, placemark: placemark.name },
            ORIGIN_SYSTEM,
          ),
        ],
      });
    }
    reports.push(report);
  }

  return { routes, points: [...pointsByKey.values()], reports, conflicts };
}
