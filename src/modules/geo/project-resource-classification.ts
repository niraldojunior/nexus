// Classificação operacional exclusiva do workspace de Projeto. Não confundir com o escopo de
// infraestrutura civil da busca Geo global: aqui entram os recursos que o Projeto apresenta na
// aba Infraestrutura, independente do caminho em ResourceCatalog.
export const PROJECT_INFRASTRUCTURE_RESOURCE_TYPE_CODES = [
  'Splitter',
  'CTO',
  'DIO',
  'SpliceClosure',
  'OpticalNode',
] as const;

export const isProjectInfrastructureResourceType = (code: string): boolean =>
  (PROJECT_INFRASTRUCTURE_RESOURCE_TYPE_CODES as readonly string[]).includes(code);
