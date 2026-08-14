import { describe, expect, it } from 'vitest';
import { ProjectIconError, validateProjectIconFile } from './projectIconImage';

const makeFile = (type: string, sizeBytes: number): File => {
  const file = new File([new Uint8Array(sizeBytes)], 'icon', { type });
  return file;
};

describe('validateProjectIconFile', () => {
  it('aceita uma imagem dentro do limite de tamanho', () => {
    expect(() => validateProjectIconFile(makeFile('image/png', 1024))).not.toThrow();
  });

  it('rejeita um arquivo que não é imagem', () => {
    expect(() => validateProjectIconFile(makeFile('application/pdf', 1024))).toThrow(
      ProjectIconError,
    );
  });

  it('rejeita uma imagem maior que 5 MB', () => {
    expect(() => validateProjectIconFile(makeFile('image/jpeg', 5 * 1024 * 1024 + 1))).toThrow(
      ProjectIconError,
    );
  });

  it('aceita uma imagem exatamente no limite de 5 MB', () => {
    expect(() => validateProjectIconFile(makeFile('image/jpeg', 5 * 1024 * 1024))).not.toThrow();
  });
});
