// Recursos pontuais do mapa na viewport (issue #416). Toda camada RESOURCE/POINT visível no Studio
// GEO usa este único caminho: uma requisição por viewport estabilizada, filtrada no servidor pelos
// ResourceTypes visíveis. Substitui o antigo fan-out de tiles z16 (um fetch por tile de ~570 m),
// cujo custo crescia com a ÁREA da viewport e travava o browser em escala nacional sempre que uma
// camada pontual ficava visível "Acima de 1 km" — independentemente de quantos recursos existiam.

import { fetchMapResources } from '../services/geoMapResourceApi';
import { createBboxFeatureHook } from './mapBboxFeatureHook';

export const useMapResources = createBboxFeatureHook(fetchMapResources);
