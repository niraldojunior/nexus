---
name: architecture-orchestrator
description: Converte uma definição high-level em plano técnico aderente às ADRs e orquestra skills especializadas com governança
---

# Skill: architecture-orchestrator

## Objetivo
Receber uma definição high-level (HLD), validar aderência arquitetural com ADRs do repositório e orquestrar skills para implementar mudanças com rastreabilidade.

## Entradas obrigatórias
- `highLevelDefinition`: problema, escopo, critérios de sucesso e restrições.
- `targetArea`: área principal afetada (ex.: `api`, `domain`, `observability`, `security`).

## Entradas opcionais
- `nonFunctionalRequirements`: latência, disponibilidade, segurança, auditoria.
- `outOfScope`: o que não deve ser alterado.
- `riskLevel`: baixo | médio | alto.

## Governança obrigatória
1. Não executar mudança sem mapear ADRs aplicáveis.
2. Regra ADR-first: se existir ADR aplicável, ela é o padrão default da execução.
3. Se houver conflito entre HLD e ADR, ativar **gate de desvio governado** antes de qualquer implementação.
4. No gate de desvio, registrar: divergência, impacto, risco, mitigação e recomendação (ajustar HLD ou evoluir ADR/RFC).
5. Se o conflito for estrutural, escalar para ARB/time dono do domínio e marcar execução como `blocked-for-governance`.
6. Só implementar em conflito após decisão formal registrada (ADR nova, atualização de ADR ou exceção aprovada).
7. Registrar decisões no plano com referência de ADR (`ADR-XXXX`).
8. Restringir a mudança ao menor conjunto de arquivos possível.
9. Exigir validação com testes e/ou evidências de execução.
10. Citar links exatos das ADRs usadas no resumo final.
11. Navegar recursivamente pasta por pasta na fonte ADR padrão e considerar todos os arquivos `.md`.
12. Executar obrigatoriamente `./scripts/architecture-orchestrator/fetch-remote-adrs.ps1` antes de analisar ADRs.
13. Selecionar skills automaticamente conforme contexto técnico; não depender de lista explícita de skills na entrada.

## Pipeline de orquestração
1. Ler HLD e extrair objetivos, constraints e critérios de aceite.
2. Executar `./scripts/architecture-orchestrator/fetch-remote-adrs.ps1` para inventariar ADRs remotas.
3. Identificar regras arquiteturais aplicáveis com base no inventário recursivo:
	- entrar pasta por pasta na fonte ADR padrão;
	- coletar todos os arquivos `.md`;
	- ignorar arquivos não markdown.
4. Avaliar aderência HLD × ADR e classificar resultado:
	- `compliant`: seguir com execução normal;
	- `conflict`: acionar gate de desvio governado;
	- `blocked-for-governance`: escalar para ARB/time dono e interromper implementação.
5. Montar plano de execução por domínio (API, regra de negócio, observabilidade, testes).
6. Delegar automaticamente para skills especializadas quando necessário (ex.: `create-endpoint` para criação de endpoint, `documentation-sync` para alinhar documentação após mudanças).
7. Validar saída contra ADR + critérios de aceite.
8. Publicar resumo final com rastreabilidade: HLD → ADR → Arquivos alterados → Testes.

## Configuração recomendada neste repositório
- Fonte ADR padrão (fixa): `https://github.com/V-tal/vtal-architecture-playbook/blob/main/docs/04-decisions`

## Mecanismo de leitura remota (obrigatório)
Para inventariar ADRs, usar conexão GitHub ativa e leitura recursiva do diretório remoto via clone leve:

1. Executar `./scripts/architecture-orchestrator/fetch-remote-adrs.ps1`.
2. O script faz clone remoto com `--depth 1 --filter=blob:none --sparse`.
3. O script aplica `sparse-checkout` em `docs/04-decisions`.
4. O script enumera `*.md` recursivamente em todas as subpastas.
5. Ler conteúdo dos arquivos `.md` aplicáveis ao HLD.
6. Garantir limpeza do diretório temporário ao final (comportamento padrão do script).

Critério mínimo de evidência no resultado:
- informar comando executado e status: `./scripts/architecture-orchestrator/fetch-remote-adrs.ps1`;
- listar ADRs encontradas (path/link);
- informar quais ADRs foram aplicadas na decisão;
- informar ADRs avaliadas mas não aplicadas;
- informar ADRs conflitantes e decisão de tratamento (`adjust-hld`, `propose-rfc`, `blocked-for-governance`).

## Formato de evidências (obrigatório)
Retornar evidências neste formato mínimo:

```text
evidence:
	adrsFetch:
		command: ./scripts/architecture-orchestrator/fetch-remote-adrs.ps1
		status: success|failed
		totalMarkdownFiles: <numero>
	adrsApplied:
		- id: ADR-XXXX
			link: <url>
			rationale: <motivo de aplicação>
	adrsDiscarded:
		- id: ADR-YYYY
			link: <url>
			reason: <motivo de não aplicação>
	adrsConflicted:
		- id: ADR-ZZZZ
			link: <url>
			conflict: <resumo do conflito com HLD>
			decision: adjust-hld|propose-rfc|blocked-for-governance
			nextAction: <ação objetiva>
	traceability:
		hld: <resumo curto>
		changeset:
			- <arquivo>
			- <arquivo>
		tests:
			- <comando>: <resultado>
```

## Contrato de saída
- `decisionSummary`: decisões tomadas e por quê.
- `adrMapping`: lista de ADRs usadas e impacto.
- `adrConflicts`: conflitos encontrados e decisão de governança aplicada.
- `executionPlan`: passos objetivos e skills delegadas.
- `changeset`: arquivos alterados/criados.
- `validation`: comandos e resultados de validação.
- `openRisks`: riscos remanescentes e follow-ups.

## Prompt de uso (exemplo)
Use a skill `architecture-orchestrator` com:

- highLevelDefinition: `Criar endpoint de comando com validação de payload, regra de negócio e observabilidade mínima.`
- targetArea: `api`
- nonFunctionalRequirements: `latência p95 < 150ms; logs com traceId; tratamento de erro padronizado`

Retorne:
1) plano de execução,
2) mapeamento ADR,
3) delegação para skills,
4) evidências de validação no formato `evidence` definido acima.
