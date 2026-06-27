# Design de Sistema - Requisitos Não Funcionais

## Observabilidade

- Manter logging estruturado com `pino`.
- Preservar um endpoint dedicado de health check.
- Habilitar tracing quando configurado.
- Evitar dependência excessiva de `console`, exceto no bootstrap ou em diagnósticos controlados.
- Usar interceptors e filters para manter logging e tratamento de erros consistentes.

## Qualidade

- Escrever testes unitários para casos de uso, presenters, repositórios e validações críticas.
- Manter os testes próximos ao código que está sendo testado.
- Preferir nomes consistentes de arquivos e pastas.
- Evitar dependências cíclicas e lógica duplicada entre módulos.

## Evolução

- Analisar cada nova capacidade primeiro como contrato de domínio.
- Só depois incorporá-la ao desenho de API, persistência e eventos.
- Reutilizar padrões de módulos existentes antes de criar novos.
- Preferir consistência transversal a variações locais sem justificativa.
