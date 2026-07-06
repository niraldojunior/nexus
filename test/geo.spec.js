import assert from 'node:assert/strict';
import { GeoRepository, GeoService } from '../src/modules/geo/index.js';
const service = new GeoService(new GeoRepository());
const location = service.createLocation({
    geometryType: 'Point',
    geometry: { type: 'Point', coordinates: [-43.18, -22.9] },
});
assert.equal(location.geometryType, 'Point');
assert.equal(location.spatialRef, 'EPSG:4326');
assert.throws(() => service.createLocation({
    geometryType: 'Point',
    geometry: { type: 'Point', coordinates: [181, 0] },
}), /coordinate out of range/);
const spec = service.createSpec({ name: 'Central Office', category: 'Site' });
const site = service.createSite({ name: 'CO Botafogo', siteSpecificationId: spec.id, placeId: location.id });
assert.equal(site.place?.id, location.id);
assert.equal(service.listSites().length, 1);
//# sourceMappingURL=geo.spec.js.map