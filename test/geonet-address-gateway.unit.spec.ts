import { describe, expect, it, vi } from 'vitest';
import { GeonetAddressGateway } from '../src/modules/geo/geonet-address-gateway.js';

const config = {
  apiBaseUrl: 'https://geonet.example/api/geographicAddressManagement/v1',
  tokenUrl: 'https://geonet.example/auth/oauth/v2/token',
  clientId: 'client',
  clientSecret: 'secret',
  companyId: 'CC9999',
  scope: 'fttx',
  timeoutMs: 1_000,
};

describe('GeonetAddressGateway', () => {
  it.each([
    [400, 'Falha na requisição.'],
    [403, 'Aplicação não autorizada ou não informada.'],
    [404, 'Endereço não encontrado.'],
    [429, 'Cota excedida por muitas requisições.'],
    [500, 'Erro interno do servidor.'],
    [503, 'Serviço indisponível.'],
    [504, 'Gateway Timeout.'],
  ])('traduz o retorno %i da API para uma mensagem de usuário', async (status, message) => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'token' }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(null, { status }));
    const gateway = new GeonetAddressGateway(config, fetchImpl);

    await expect(gateway.search('Rua Exemplo')).rejects.toMatchObject({
      statusCode: status,
      message,
    });
  });

  it('normaliza a busca e detalhe mesmo com envelopes distintos do Swagger', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'token', expires_in: 600 }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            control: { type: 'S', code: 200 },
            addresses: {
              address: [
                {
                  id: 345959,
                  description: 'Rua Exemplo, 10 - Rio de Janeiro, RJ (20000-000)',
                  streetName: 'Exemplo',
                  streetType: 'Rua',
                  number: 10,
                  city: 'Rio de Janeiro',
                  stateAbbreviation: 'RJ',
                  zipCode: 20000000,
                },
              ],
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            address: {
              id: 345959,
              description: 'Rua Exemplo, 10 - Rio de Janeiro, RJ (20000-000)',
              geolocation: {
                latitude: '-22.9100',
                longitude: '-43.1800',
                returnTypeDescription: 'LOGRADOURO SURVEY',
              },
            },
          }),
          { status: 200 },
        ),
      );
    const gateway = new GeonetAddressGateway(config, fetchImpl);

    await expect(gateway.search('Rua Exemplo, Rio de Janeiro, RJ', '10')).resolves.toEqual([
      expect.objectContaining({
        addressId: '345959',
        street: 'Rua Exemplo',
        streetNr: '10',
        postcode: '20000000',
      }),
    ]);
    await expect(gateway.detail('345959')).resolves.toEqual(
      expect.objectContaining({
        addressId: '345959',
        coordinates: [-43.18, -22.91],
        geolocationMethod: 'LOGRADOURO SURVEY',
      }),
    );

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('grant_type=client_credentials'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(String(fetchImpl.mock.calls[1]?.[0])).toContain('address=Rua+Exemplo');
    expect(String(fetchImpl.mock.calls[1]?.[0])).toContain('number=10');
    expect(fetchImpl.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer token' }),
      }),
    );
  });
});
