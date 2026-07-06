import assert from 'node:assert/strict';
import test from 'node:test';
import { GeoRepository, GeoService } from '../src/modules/geo/index.js';
test('GeoService creates canonical location payloads', () => {
    const service = new GeoService(new GeoRepository());
    const location = service.createLocation({
        geometryType: 'Point',
        geometry: { type: 'Point', coordinates: [-43.18, -22.9] },
        accuracy: 'GPS',
        referencePoint: 'Rua principal',
    });
    assert.equal(location['@type'], 'GeographicLocation');
    assert.equal(location.geometryType, 'Point');
    assert.equal(location.spatialRef, 'EPSG:4326');
    assert.equal(location.accuracy, 'GPS');
    assert.equal(location.referencePoint, 'Rua principal');
    assert.match(location.id, /^[0-9a-f-]{36}$/);
});
test('GeoService rejects malformed geometry payloads', () => {
    const service = new GeoService(new GeoRepository());
    assert.throws(() => service.createLocation({
        geometryType: 'Point',
        geometry: { type: 'LineString', coordinates: [[-43, -22], [-42, -21]] },
    }), /geometry type mismatch/);
    assert.throws(() => service.createLocation({
        geometryType: 'LineString',
        geometry: { type: 'LineString', coordinates: [[-43, -22]] },
    }), /linestring needs at least 2 points/);
    assert.throws(() => service.createLocation({
        geometryType: 'Polygon',
        geometry: {
            type: 'Polygon',
            coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1]]],
        },
    }), /polygon ring must be closed/);
});
test('GeoService keeps repository state isolated from returned objects', () => {
    const service = new GeoService(new GeoRepository());
    const spec = service.createSpec({ name: 'Central Office', category: 'Site' });
    const site = service.createSite({ name: 'CO Botafogo', siteSpecificationId: spec.id });
    site.name = 'mutated locally';
    const stored = service.listSites()[0];
    assert.ok(stored);
    assert.equal(stored.name, 'CO Botafogo');
});
//# sourceMappingURL=geo.unit.spec.js.map