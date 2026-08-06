import { describe, expect, it } from 'vitest';
import { geocodeErrorMessage } from './googleMaps';

describe('geocodeErrorMessage', () => {
  it('traduz os status conhecidos do Geocoder para pt-BR', () => {
    expect(geocodeErrorMessage('ZERO_RESULTS')).toBe(
      'Nenhum endereço encontrado para esta pesquisa.',
    );
    expect(geocodeErrorMessage('REQUEST_DENIED')).toBe(
      'O serviço de geocodificação do Google não está habilitado para esta chave.',
    );
    expect(geocodeErrorMessage('OVER_QUERY_LIMIT')).toBe(
      'Limite de consultas ao Google Maps excedido. Tente novamente em instantes.',
    );
    expect(geocodeErrorMessage('INVALID_REQUEST')).toBe('Pesquisa inválida.');
    expect(geocodeErrorMessage('NO_API_KEY')).toBe('Chave do Google Maps não configurada.');
  });

  it('cai numa mensagem genérica com o status embutido quando desconhecido', () => {
    expect(geocodeErrorMessage('SOME_UNKNOWN_STATUS')).toBe(
      'Erro ao consultar o Google Maps (SOME_UNKNOWN_STATUS).',
    );
  });
});
