// Sites do mapa na viewport (issue #314). Todo GeographicSite pontual visível no Studio GEO usa
// este único caminho: uma requisição por viewport estabilizada, sem decompor a área em tiles z16.
// Debounce, folga de bbox, dedupe em voo e invalidação vêm de createBboxFeatureHook.

import { fetchMapSites } from '../services/geoMapSiteApi';
import { createBboxFeatureHook } from './mapBboxFeatureHook';

export { paddedSiteBounds } from './mapBboxFeatureHook';

export const useMapSites = createBboxFeatureHook(fetchMapSites);
