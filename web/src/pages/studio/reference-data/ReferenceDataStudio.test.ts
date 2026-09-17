import { describe, expect, it } from 'vitest';
import { validateReferenceDataSetDraft } from './ReferenceDataStudio';

describe('validateReferenceDataSetDraft', () => {
  it('exige nome e chave antes de permitir criar o conjunto', () => {
    expect(validateReferenceDataSetDraft({ name: '   ', key: '   ' })).toEqual({
      name: 'Informe o nome do conjunto.',
      key: 'Informe a chave do conjunto.',
    });
  });

  it('rejeita chave fora do formato canônico', () => {
    expect(validateReferenceDataSetDraft({ name: 'Tipo de fibra', key: 'Tipo_Fibra' })).toEqual({
      key: 'Use letras minúsculas, números e hífen; a chave deve começar por uma letra.',
    });
  });

  it('aceita campos válidos depois de remover espaços incidentais', () => {
    expect(validateReferenceDataSetDraft({ name: '  Tipo de fibra  ', key: '  tipo-fibra  ' })).toEqual(
      {},
    );
  });
});
