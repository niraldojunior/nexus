import type { StudioDomainAdapter, StudioValidationIssue, StudioValidationResult } from '../domain.js';
import type { GeoService } from '../../geo/service.js';
import type { Characteristic, GeoJSONPolygon, GeographicLocation } from '../../geo/domain.js';

export const SPATIAL_CHARACTERISTIC_GROUP = '_spatial';
export const SPATIAL_REFERENCE_PREFIX = 'STUDIO-SPATIAL:';
export const EDITABLE_COVERAGE_KIND = 'EditableCoverage';

export type SpatialCoverageSnapshot = {
  id?: string;
  key: string;
  name: string;
  coverageType: string;
  geometry: GeoJSONPolygon;
};

export type SpatialStudioSnapshot = {
  coverages: SpatialCoverageSnapshot[];
};

// `platform.admin` é quem faz `GeoService.assertRole` liberar sem checar papel específico
// (ver `assertRole` em src/modules/geo/service.ts) — mesmo padrão de `LocationModelStudioAdapter`.
// Sem ele, `listLocations`/`createLocation`/`updateLocation`/`terminateLocation` respondiam 403
// dentro da própria publicação, pois nenhum dos papéis anteriores cobria `inventory.reader`/
// `inventory.editor`.
const studioContext = (tenantId: string) => ({
  tenantId,
  actorSub: 'studio-adapter',
  roles: ['studio.admin', 'geo.admin', 'platform.admin'],
  traceId: `studio-materialize-spatial-${Date.now()}`,
});

export const spatialCharacteristic = (
  characteristics: Characteristic[],
  name: string,
): Characteristic | undefined =>
  characteristics.find(
    (characteristic) =>
      characteristic.group === SPATIAL_CHARACTERISTIC_GROUP && characteristic.name === name,
  );

export const isStudioSpatialCoverage = (location: GeographicLocation): boolean =>
  location.geometryType === 'Polygon' &&
  location.referencePoint?.startsWith(SPATIAL_REFERENCE_PREFIX) === true &&
  spatialCharacteristic(location.characteristic, 'kind')?.value === EDITABLE_COVERAGE_KIND;

export const spatialCoverageName = (location: GeographicLocation): string => {
  const name = spatialCharacteristic(location.characteristic, 'name')?.value;
  return typeof name === 'string' ? name : location.referencePoint?.slice(SPATIAL_REFERENCE_PREFIX.length) ?? location.id;
};

export const spatialCoverageType = (location: GeographicLocation): string => {
  const coverageType = spatialCharacteristic(location.characteristic, 'coverageType')?.value;
  return typeof coverageType === 'string' ? coverageType : '';
};

const characteristicsFor = (
  coverage: Pick<SpatialCoverageSnapshot, 'name' | 'coverageType'>,
  current: Characteristic[] = [],
): Characteristic[] => [
  ...current.filter((characteristic) => characteristic.group !== SPATIAL_CHARACTERISTIC_GROUP),
  { group: SPATIAL_CHARACTERISTIC_GROUP, name: 'kind', value: EDITABLE_COVERAGE_KIND, valueType: 'string' },
  { group: SPATIAL_CHARACTERISTIC_GROUP, name: 'name', value: coverage.name.trim(), valueType: 'string' },
  {
    group: SPATIAL_CHARACTERISTIC_GROUP,
    name: 'coverageType',
    value: coverage.coverageType.trim(),
    valueType: 'string',
  },
];

function validatePolygon(geometry: unknown): string | undefined {
  if (!geometry || typeof geometry !== 'object') return 'A geometria da cobertura é obrigatória.';
  const polygon = geometry as Partial<GeoJSONPolygon>;
  if (polygon.type !== 'Polygon' || !Array.isArray(polygon.coordinates)) {
    return 'A cobertura deve usar uma geometria GeoJSON Polygon.';
  }
  if (polygon.coordinates.length === 0) return 'A cobertura deve conter ao menos um anel.';
  for (const ring of polygon.coordinates) {
    if (!Array.isArray(ring) || ring.length < 4) {
      return 'Cada anel do polígono deve ter ao menos quatro coordenadas.';
    }
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (!first || !last || first[0] !== last[0] || first[1] !== last[1]) {
      return 'Todos os anéis do polígono devem estar fechados.';
    }
    for (const coordinate of ring) {
      const [lng, lat] = coordinate;
      if (
        typeof lng !== 'number' ||
        typeof lat !== 'number' ||
        !Number.isFinite(lng) ||
        !Number.isFinite(lat) ||
        lng < -180 ||
        lng > 180 ||
        lat < -90 ||
        lat > 90
      ) {
        return 'As coordenadas da cobertura devem estar no intervalo WGS84.';
      }
    }
  }
  return undefined;
}

export class SpatialStudioAdapter implements StudioDomainAdapter {
  public readonly domain = 'spatial';

  constructor(private readonly geoService: GeoService) {}

  public async validate(snapshot: Record<string, unknown>): Promise<StudioValidationResult> {
    const issues: StudioValidationIssue[] = [];
    const typed = snapshot as unknown as Partial<SpatialStudioSnapshot>;
    const coverages = typed.coverages;
    if (!Array.isArray(coverages)) {
      return {
        valid: false,
        issues: [
          {
            severity: 'error',
            code: 'SPATIAL_COVERAGES_ARRAY_REQUIRED',
            message: 'A lista de coberturas espaciais (coverages) é obrigatória.',
            path: 'coverages',
          },
        ],
        validatedAt: new Date().toISOString(),
      };
    }

    const keys = new Set<string>();
    const names = new Set<string>();
    for (let index = 0; index < coverages.length; index += 1) {
      const coverage = coverages[index];
      const path = `coverages[${index}]`;
      const key = coverage?.key?.trim();
      const name = coverage?.name?.trim();
      if (!key) {
        issues.push({ severity: 'error', code: 'SPATIAL_KEY_REQUIRED', message: 'A chave da cobertura é obrigatória.', path: `${path}.key` });
      } else if (keys.has(key.toLowerCase())) {
        issues.push({ severity: 'error', code: 'SPATIAL_KEY_DUPLICATE', message: `Chave de cobertura duplicada: ${key}.`, path: `${path}.key` });
      } else keys.add(key.toLowerCase());
      if (!name) {
        issues.push({ severity: 'error', code: 'SPATIAL_NAME_REQUIRED', message: 'O nome da cobertura é obrigatório.', path: `${path}.name` });
      } else if (names.has(name.toLowerCase())) {
        issues.push({ severity: 'error', code: 'SPATIAL_NAME_DUPLICATE', message: `Nome de cobertura duplicado: ${name}.`, path: `${path}.name` });
      } else names.add(name.toLowerCase());
      if (!coverage?.coverageType?.trim()) {
        issues.push({ severity: 'error', code: 'SPATIAL_TYPE_REQUIRED', message: 'O tipo da cobertura é obrigatório.', path: `${path}.coverageType` });
      }
      const geometryError = validatePolygon(coverage?.geometry);
      if (geometryError) {
        issues.push({ severity: 'error', code: 'SPATIAL_POLYGON_INVALID', message: geometryError, path: `${path}.geometry` });
      }
    }
    return { valid: issues.length === 0, issues, validatedAt: new Date().toISOString() };
  }

  public async materialize(snapshot: Record<string, unknown>, context: { tenantId: string }): Promise<void> {
    const validation = await this.validate(snapshot);
    if (!validation.valid) throw new Error(validation.issues.map((issue) => issue.message).join('; '));

    const typed = snapshot as unknown as SpatialStudioSnapshot;
    const reqContext = studioContext(context.tenantId);
    const existing = await this.geoService.listLocations(undefined, reqContext);
    // Históricos encerrados permanecem no inventário por C6, mas não pertencem ao snapshot
    // operacional atual nem devem gerar um novo evento de encerramento a cada publicação.
    const managed = existing.filter(
      (location) => isStudioSpatialCoverage(location) && !location.validFor?.endDateTime,
    );
    const managedById = new Map(managed.map((location) => [location.id, location]));
    const managedByKey = new Map(
      managed.map((location) => [location.referencePoint!.slice(SPATIAL_REFERENCE_PREFIX.length), location]),
    );
    const snapshotIds = new Set<string>();

    for (const coverage of typed.coverages) {
      const current = coverage.id ? managedById.get(coverage.id) : managedByKey.get(coverage.key);
      if (coverage.id && !current) {
        throw new Error(`A cobertura ${coverage.id} não pertence ao domínio Espacial do Studio.`);
      }
      if (current) {
        snapshotIds.add(current.id);
        await this.geoService.updateLocation(
          current.id,
          {
            geometryType: 'Polygon',
            geometry: coverage.geometry,
            spatialRef: 'EPSG:4326',
            accuracy: 'desenho-manual',
            sourceSystem: 'MANUAL',
            referencePoint: `${SPATIAL_REFERENCE_PREFIX}${coverage.key.trim()}`,
            characteristic: characteristicsFor(coverage, current.characteristic),
          },
          reqContext,
        );
      } else {
        await this.geoService.createLocation(
          {
            geometryType: 'Polygon',
            geometry: coverage.geometry,
            spatialRef: 'EPSG:4326',
            accuracy: 'desenho-manual',
            sourceSystem: 'MANUAL',
            referencePoint: `${SPATIAL_REFERENCE_PREFIX}${coverage.key.trim()}`,
            characteristic: characteristicsFor(coverage),
          },
          reqContext,
        );
      }
    }

    for (const coverage of managed) {
      if (!snapshotIds.has(coverage.id)) await this.geoService.terminateLocation(coverage.id, reqContext);
    }
  }
}
