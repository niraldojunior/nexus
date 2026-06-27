---
name: documentation-sync
description: Sincroniza documentação técnica após mudanças de código (README, exemplos de endpoint, contratos, evidências)
---

# Skill: documentation-sync

## Objetivo
Atualizar documentação do repositório para refletir mudanças implementadas, evitando drift entre código e docs.

## Entradas obrigatórias
- `changeSummary`: resumo das mudanças implementadas.
- `scope`: áreas afetadas (ex.: `api`, `errors`, `observability`, `tests`).

## Entradas opcionais
- `targetFiles`: arquivos de documentação preferenciais (ex.: `README.md`).
- `includeExamples`: incluir/atualizar exemplos de request/response (`true|false`).
- `includeRunbook`: incluir seção de validação operacional (`true|false`).

## Regras obrigatórias
1. Não inventar funcionalidades que não existem no código.
2. Priorizar mudanças mínimas e focadas nos trechos impactados.
3. Manter consistência de termos entre código, README e skills.
4. Se endpoint mudou, atualizar exemplos e status code esperados.
5. Se fluxo de execução mudou, atualizar comandos e evidências.

## Procedimento
1. Identificar arquivos de documentação impactados.
2. Cruzar `changeSummary` com contratos reais implementados.
3. Atualizar seções necessárias com linguagem objetiva.
4. Verificar se exemplos e comandos executam conforme esperado.
5. Entregar resumo de arquivos alterados e o que foi sincronizado.

## Saída esperada
- `updatedDocs`: lista de arquivos atualizados.
- `syncSummary`: resumo do que foi sincronizado.
- `consistencyChecks`: itens verificados (contrato, erros, comandos, evidências).
