# Design de Sistema - Arquitetura

## Princípios Arquiteturais

- Adotar Clean Architecture com separação explícita entre `application`, `domain`, `infra` e `presentation`.
- Manter as regras de negócio isoladas de frameworks e detalhes de transporte.
- Concentrar a lógica de negócio em casos de uso, regras de domínio e modelos de domínio.
- Evitar lógica de negócio em controllers, handlers e presenters.
- Preferir composição modular em vez de um monólito sem fronteiras claras.

## Estrutura de Módulos

- Organizar o produto em módulos funcionais sob `src/module`.
- Manter o código transversal em `src/shared`.
- Cada fronteira funcional clara deve ter seu próprio `app.module.ts`.
- A ativação de módulos deve ser dirigida por configuração, não por edições manuais de código.
- Seguir um bootstrap dedicado em `main.ts` para cada aplicação executável.

## Padrão de Exposição de API

- Expor APIs HTTP com NestJS e Fastify.
- Usar versionamento por URI com prefixo `v`.
- Manter o prefixo global de rotas configurável por ambiente.
- Aplicar validação global com `ValidationPipe` e `class-validator`.
- Publicar documentação interativa do Swagger quando habilitada por configuração.
- Aplicar CORS com origens controladas por configuração.

## Forma de Implementação

- Controllers devem orquestrar casos de uso, não implementar regras de domínio.
- Presenters devem adaptar modelos de domínio para contratos de transporte.
- Casos de uso devem encapsular os fluxos da aplicação.
- Repositórios devem ser acessados por portas/interfaces.
- Implementações de infraestrutura devem permanecer substituíveis por tecnologia.
