/**
 * Nomes de characteristic reservados a um significado canônico único, para não repetir a string
 * mágica em cada leitor/escritor (issue #251, fechando o ciclo aberto pela #171). `model` é
 * characteristic legítima de ResourceType/ResourceSpecification — ao contrário de `manufacturer`
 * e `networkType`, que são proibidas como characteristic por serem campos de primeira classe
 * (`relatedParty`/`categoryCode`, ver `assertCanonicalCharacteristics` em `service.ts`) — mas seu
 * `valueType`/`group` precisam ser consistentes em toda declaração, senão a leitura em
 * `characteristicValue('model')` (repository.ts/oracle-repository.ts) silenciosamente não acha
 * nada em specs onde alguém digitou `Model`, `valueType: 'number'` ou um `group` diferente.
 */
export const MODEL_CHARACTERISTIC = {
  name: 'model',
  valueType: 'string' as const,
  group: 'commercial',
} as const;
