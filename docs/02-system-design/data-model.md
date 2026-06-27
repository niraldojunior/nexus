# Design de Sistema - Modelo de Dados

## Princípios de Persistência

- Suportar múltiplos backends de persistência por configuração.
- Tratar `memory` como opção válida para desenvolvimento e testes.
- Preservar compatibilidade com MongoDB e SQLite quando o domínio exigir.
- Usar modelos e mapeadores explícitos entre domínio e persistência.
- Preferir portas de repositório com implementações específicas por tecnologia.

## Identidade e Histórico

- Gerar identificadores canônicos no backend.
- Não depender de IDs gerados pelo cliente como identidade principal.
- Preservar a proveniência de dados importados ou migrados.
- Quando necessário, registrar dados de origem legada em atributos rastreáveis.
- Evitar exclusão física quando o domínio exigir histórico auditável.

## Regras de Modelagem de Domínio

- Manter conceitos de catálogo separados de conceitos de inventário.
- Tratar entidades de catálogo como definições do que pode existir.
- Tratar entidades de inventário como instâncias concretas do que existe.
- Usar modelos de domínio para expressar explicitamente ciclo de vida, contenção e relacionamentos.
- Preservar o significado técnico em nomes de campos e regras de mapeamento.

## Mapeamento de Dados

- Usar mapeadores dedicados para documentos de persistência e modelos de domínio.
- Manter a lógica de mapeamento determinística e reversível sempre que possível.
- Evitar vazamento de estruturas específicas do armazenamento para o código de domínio.
- Manter o comportamento de filtros e paginação consistente entre os repositórios.
