---
name: create-endpoint
description: Cria um novo endpoint HTTP em NestJS/TypeScript seguindo o padrão deste repositório (controller, service, dto/domain, validação e tratamento de erro global)
---

# Skill: create-endpoint

## Objetivo
Criar um endpoint HTTP novo no padrão do projeto, com mudanças mínimas e sem inventar arquitetura.

## Entradas obrigatórias
- `method`: GET | POST | PUT | PATCH | DELETE
- `path`: rota HTTP (ex.: `/api/v1/mensagens`)
- `controllerTarget`: arquivo/controller alvo (reaproveitar em `src/presentation/http/controllers` ou criar novo somente se necessário)
- `serviceName`: nome do service alvo (ou criar novo em `src/application/services`)
- `requestDomain`: estrutura do request (campos, tipos e contrato JSON)
- `responseDomain`: estrutura do response (campos, tipos e contrato JSON)
- `businessRules`: regras de negócio essenciais
- `errorCases`: lista de erros esperados (400/404/409/422/500)

## Entradas opcionais
- `headers`: headers obrigatórios
- `queryParams`: query params
- `pathParams`: path params
- `idempotency`: se exige comportamento idempotente
- `auth`: requisitos de autenticação/autorização
- `swaggerDocs`: necessidade de anotação/atualização Swagger

## Regras obrigatórias deste repositório
1. Não criar camadas/padrões novos além dos já existentes.
2. Reutilizar validação/erro/log já adotados (`ValidationPipe` global, `GlobalExceptionFilter`, `LoggerProvider`).
3. Posicionar arquivos nestes pacotes:
   - Controller: `src/presentation/http/controllers`
   - Module HTTP: `src/presentation/http/modules`
   - Service: `src/application/services`
   - DTOs: `src/application/dtos`
   - Domain: `src/domain`
   - Infra/observabilidade (se necessário): `src/infrastructure`
4. Preservar telemetria/logging/configuração atuais (`src/infrastructure/telemetry`, `src/infrastructure/log`, `src/config`).
5. Não alterar endpoints existentes sem necessidade explícita.
6. Tratamento de erro deve seguir padrão atual via exceções HTTP + `GlobalExceptionFilter`.
7. Criar/atualizar testes unitários para controller e service em `src/test` para cada endpoint novo.

## Procedimento
1. Verificar se já existe controller/service compatível para reaproveitar.
2. Criar/atualizar DTOs de request/response em `src/application/dtos`.
3. Criar/atualizar domain models em `src/domain` quando houver regra de negócio.
4. Implementar método no service com regras de negócio informadas.
5. Implementar endpoint no controller com decorators Nest (`@Get/@Post/...`, `@Param`, `@Body`, `@Query`).
6. Garantir registro correto no módulo HTTP (`src/presentation/http/modules`) quando necessário.
7. Aplicar validações de entrada com `class-validator` no DTO (e regras adicionais no service).
8. Mapear falhas de negócio para `HttpException` apropriada para retorno HTTP padronizado.
9. Garantir resposta HTTP e payload aderentes ao contrato solicitado.
10. Atualizar documentação do endpoint (anotações Swagger no controller/DTOs).
11. Criar/atualizar specs unitárias em `src/test` cobrindo cenários de sucesso e erro.

## Padrão de implementação esperado

### Controller
- Usar decorators NestJS e versionamento/path no padrão existente (ex.: `@Controller("api/v1/...")`).
- Receber e validar entrada via DTO.
- Chamar o service sem concentrar regra de negócio no controller.
- Retornar DTO de resposta.
- Anotar Swagger (`@ApiTags`, `@ApiOperation`, `@ApiResponse`).

### Service
- Concentrar regra de negócio.
- Converter DTO <-> Domain quando necessário.
- Lançar `BadRequestException`, `UnprocessableEntityException`, `NotFoundException`, etc., conforme contrato.

### Testes Unitários
- Criar `*.spec.ts` em `src/test` para controller e service envolvidos.
- Cobrir ao menos: 1 cenário de sucesso, 1 cenário de validação/erro de negócio e 1 cenário de erro inesperado (quando aplicável).
- Mockar dependências no teste de controller; no teste de service, validar regras de negócio diretamente.

### DTO/Domain
- DTOs em `src/application/dtos` com `class-validator` e `@ApiProperty`.
- Domains em `src/domain` com encapsulamento simples quando houver regra de negócio.
- Nomes consistentes com o padrão já existente no projeto.

## Saída esperada
- Lista objetiva de arquivos criados/alterados.
- Resumo curto do endpoint criado.
- Comandos de validação executáveis.

## Checklist de validação
- Build compila sem erro.
- Endpoint responde status correto para sucesso e erros mapeados.
- DTOs/domains e validações refletem o contrato solicitado.
- Logging/telemetria/config seguem padrão atual.
- Testes unitários do endpoint e service passam localmente.

## Comandos de validação
- `npm run test`
- `npm run build`
- (opcional) `npm run lint`

## Prompt de uso (exemplo)
Use a skill `create-endpoint` para criar o endpoint `POST /api/v1/mensagens`.

Detalhes:
- controllerTarget: `src/presentation/http/controllers/mensagem.controller.ts`
- serviceName: `MensagemService`
- requestDomain: `{ "conteudo": "string" }`
- responseDomain: `{ "mensagem": "string" }`
- businessRules: `conteudo obrigatório; rejeitar vazio`
- errorCases: `400 para payload inválido; 422 para regra de negócio; 500 para inesperado`
- tests: `criar src/test/mensagem.controller.spec.ts e src/test/mensagem.service.spec.ts com cenários de sucesso e erro`
