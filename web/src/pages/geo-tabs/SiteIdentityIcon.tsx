import { useEffect, useState } from 'react';
import { getGeoSite } from '../../services/geoApi';
import { useGeoSpecs } from '../../hooks/useGeoSpecs';
import { useVisualIdentityPreviewUrl } from '../../hooks/useVisualIdentityPreviewUrl';
import {
  STUDIO_GEO_CUSTOM_ICON_COLOR,
  STUDIO_GEO_NEUTRAL_ICON_COLOR,
} from '../../utils/studioGeoDefaults';
import { locationCategoryIcon } from '../studio/location-model/locationCategoryPresentation';

// Spec de cada Site por id. Requisição em voo compartilhada (StrictMode/remontagens; o backend
// de dev atende em série) e mantida em cache — a spec de um Site não muda durante a sessão.
const specIdBySite = new Map<string, Promise<string | undefined>>();
const loadSiteSpecId = (siteId: string) => {
  let request = specIdBySite.get(siteId);
  if (!request) {
    request = getGeoSite(siteId)
      .then((site) => site?.siteSpecificationId)
      .catch(() => {
        specIdBySite.delete(siteId);
        return undefined;
      });
    specIdBySite.set(siteId, request);
  }
  return request;
};

/**
 * Ícone do Site referenciado por id — a identidade visual configurada na Modelagem de Locais para
 * a spec dele (mesma regra de `SiteSpecIcon` na Planta Interna). Sem identidade, cai no glifo da
 * categoria da spec; enquanto carrega, no glifo de Site externo. Quem já conhece a spec (ex.: nó
 * da árvore, `GeoTreeNode.siteSpecificationId`) a passa em `specificationId` e evita a busca do Site.
 */
export function SiteIdentityIcon({
  siteId,
  specificationId,
  size = 18,
}: {
  siteId?: string;
  specificationId?: string;
  size?: number;
}) {
  const [fetchedSpecId, setFetchedSpecId] = useState<string>();
  const { specs } = useGeoSpecs();

  useEffect(() => {
    setFetchedSpecId(undefined);
    if (specificationId || !siteId) return;
    let active = true;
    void loadSiteSpecId(siteId).then((id) => active && setFetchedSpecId(id));
    return () => {
      active = false;
    };
  }, [siteId, specificationId]);

  const specId = specificationId ?? fetchedSpecId;
  const spec = specId ? specs?.find((candidate) => candidate.id === specId) : undefined;
  const url = useVisualIdentityPreviewUrl(spec?.visualIdentity, size, {
    shape: 'none',
    color: STUDIO_GEO_NEUTRAL_ICON_COLOR,
    assetColor: STUDIO_GEO_CUSTOM_ICON_COLOR,
  });
  if (url) {
    return (
      <img
        src={url}
        alt=""
        aria-hidden="true"
        className="shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  const CategoryIcon = locationCategoryIcon(spec?.category ?? 'Site');
  return (
    <CategoryIcon className="shrink-0" style={{ width: size, height: size }} aria-hidden="true" />
  );
}
