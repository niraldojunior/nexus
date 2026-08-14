import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchViaCep } from './viaCepApi';

const okResponse = (body: unknown) => ({ ok: true, json: () => Promise.resolve(body) });
const errResponse = (status: number) => ({ ok: false, status, json: () => Promise.resolve(null) });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchViaCep', () => {
  it('normaliza os campos de um CEP existente', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okResponse({
        cep: '24220-401',
        logradouro: 'Rua Doutor Paulo César',
        complemento: 'de 100 a 200',
        bairro: 'Icaraí',
        localidade: 'Niterói',
        uf: 'RJ',
        ibge: '3303302',
        ddd: '21',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchViaCep('24220-401');

    expect(fetchMock).toHaveBeenCalledWith('https://viacep.com.br/ws/24220401/json/');
    expect(result).toEqual({
      status: 'ready',
      address: {
        cep: '24220-401',
        logradouro: 'Rua Doutor Paulo César',
        complemento: 'de 100 a 200',
        bairro: 'Icaraí',
        localidade: 'Niterói',
        uf: 'RJ',
        ibge: '3303302',
        ddd: '21',
      },
    });
  });

  it('trata o `{ erro: true }` do ViaCEP como não encontrado', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse({ erro: true })));
    expect(await fetchViaCep('00000000')).toEqual({ status: 'not_found' });
  });

  it('trata resposta não-ok como não encontrado', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(errResponse(404)));
    expect(await fetchViaCep('11111111')).toEqual({ status: 'not_found' });
  });

  it('devolve não encontrado sem chamar a rede para CEP inválido', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchViaCep('123')).toEqual({ status: 'not_found' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('deduplica chamadas para o mesmo CEP (cache por CEP)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse({ cep: '22222-222', localidade: 'X' }));
    vi.stubGlobal('fetch', fetchMock);

    const [a, b] = await Promise.all([fetchViaCep('22222222'), fetchViaCep('22222-222')]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
  });
});
