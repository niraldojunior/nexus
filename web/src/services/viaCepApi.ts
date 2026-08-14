import { normalizeCep } from '../utils/cep';

// Consulta ao DNE (base de endereçamento dos Correios) via ViaCEP — API pública, sem
// credencial. É leitura transitória: alimenta o card informativo do painel de Endereço e não
// cria GeographicAddress no Nexus. Falamos direto com viacep.com.br do navegador (mesma
// abordagem da Routes API do Google em utils/googleRoutes.ts); o rewrite global de fetch só
// reescreve caminhos /v1 e /tmf-api (ver services/fetch-compat.ts), então a URL absoluta passa.

const VIA_CEP_BASE_URL = 'https://viacep.com.br/ws';

export type ViaCepAddress = {
  cep: string;
  logradouro: string;
  complemento: string;
  bairro: string;
  localidade: string;
  uf: string;
  ibge: string;
  ddd: string;
};

export type ViaCepResult = { status: 'ready'; address: ViaCepAddress } | { status: 'not_found' };

// CEP é imutável: cacheamos por CEP para não repetir a chamada (inclusive no double-invoke do
// React.StrictMode). Guardamos a promessa em voo, à moda do `inFlight` de useGeonetAddress.
const cache = new Map<string, Promise<ViaCepResult>>();

async function requestViaCep(cep: string): Promise<ViaCepResult> {
  const response = await fetch(`${VIA_CEP_BASE_URL}/${cep}/json/`);
  if (!response.ok) return { status: 'not_found' };
  const body = (await response.json().catch(() => null)) as
    (Partial<ViaCepAddress> & { erro?: boolean | string }) | null;
  // ViaCEP responde 200 com `{ "erro": true }` para um CEP inexistente.
  if (!body || body.erro || !body.cep) return { status: 'not_found' };
  return {
    status: 'ready',
    address: {
      cep: body.cep,
      logradouro: body.logradouro ?? '',
      complemento: body.complemento ?? '',
      bairro: body.bairro ?? '',
      localidade: body.localidade ?? '',
      uf: body.uf ?? '',
      ibge: body.ibge ?? '',
      ddd: body.ddd ?? '',
    },
  };
}

export function fetchViaCep(cep: string): Promise<ViaCepResult> {
  const normalized = normalizeCep(cep);
  if (!normalized) return Promise.resolve({ status: 'not_found' });
  const cached = cache.get(normalized);
  if (cached) return cached;
  const pending = requestViaCep(normalized).catch((reason: unknown) => {
    // Falha de rede não deve envenenar o cache — some para permitir nova tentativa.
    cache.delete(normalized);
    throw reason;
  });
  cache.set(normalized, pending);
  return pending;
}
