# Segurança

> Modelo de segurança do V.tal Nexus sobre a stack corporativa (Apigee · OpenShift · Oracle · Redis ·
> Kafka). Arquitetura em [`architecture.md`](architecture.md); premissa multi-tenant em
> [`../1-overview/business-rules.md`](../1-overview/business-rules.md) (C8).

---

## 1. Estado atual — e por que é bloqueador

O backend hoje valida um **único token estático global**:

```ts
// src/shared/http/app.ts
if (header !== `Bearer ${config.authToken}`) throw forbiddenError();
```

| Consequência                                                   | Gravidade |
| -------------------------------------------------------------- | --------- |
| **Não há identidade de usuário** — toda requisição é anônima   | 🔴        |
| **Não há tenant na requisição** — nenhum isolamento entre ISPs | 🔴        |
| **Não há papéis** — quem lê pode escrever e apagar             | 🔴        |
| **Auditoria impossível** — não há a quem atribuir uma ação     | 🔴        |
| Rotação de credencial derruba todos os consumidores de uma vez | 🟠        |

> ❗ Numa plataforma **wholesale**, onde ISPs concorrentes consultam o mesmo inventário, ausência de
> isolamento de tenant é **bloqueador de go-live** — não dívida técnica. Um ISP consegue ler a base
> instalada do concorrente.
>
> **Atualização (laboratório):** já existe um **IdP local** — login por e-mail/senha (scrypt) que
> emite JWT HS256 com os mesmos claims que o Apigee injetaria (`sub`, `tenant_id`, `roles`, `exp`,
> `tv`). O verificador de JWT em `request-context.ts` passou a **rejeitar assinatura inválida**
> (antes aceitava qualquer token com formato de JWT quando havia verificador configurado). RBAC é
> imposto nas rotas de **usuários** e no **histórico de pesquisa Geo**; o restante dos módulos ainda
> exige apenas autenticação (ver §9 e `../1-overview/open-questions.md`). Isolamento multi-tenant
> (§4) continua pendente. Quando o Apigee entrar, troca-se o emissor local e o lado resource-server
> permanece intacto.

---

## 2. Identidade — Apigee como fronteira

A identidade entra pelo **Apigee** e é propagada como claims assinados. O backend nunca autentica
usuário final diretamente.

```text
ISP/Operador ──▶ APIGEE ──────────────────────────▶ nexus-api
                 · valida OAuth2 / JWT (JWKS)        · confia nos claims
                 · resolve API Product → tenant      · NÃO reautentica
                 · injeta claims assinados           · aplica RBAC + tenant
                 · quota e spike arrest por tenant   · audita o ator
                 · mTLS para o backend
```

**Claims obrigatórios em toda requisição autenticada:**

| Claim       | Conteúdo                                           |
| ----------- | -------------------------------------------------- |
| `sub`       | Identificador do ator (usuário ou service account) |
| `tenant_id` | Party/Tenant dono do contexto — **obrigatório**    |
| `roles`     | Lista de papéis (§3)                               |
| `scope`     | Escopos OAuth2 por API                             |
| `trace_id`  | Correlação ponta a ponta                           |

**Confiança:** o backend só aceita conexão com **mTLS do Apigee** e valida a assinatura do JWT contra
o JWKS (cacheado em Redis, TTL 12 h). Sem isso, "confiar no claim" viraria falha de autenticação por
spoofing.

`/health` permanece público, para readiness/liveness do OpenShift.

---

## 3. Autorização — RBAC

| Papel              | Pode                                                                   |
| ------------------ | ---------------------------------------------------------------------- |
| `inventory.reader` | Ler inventário do próprio tenant                                       |
| `inventory.editor` | Criar e alterar Geo/Resource/Service                                   |
| `order.requester`  | Abrir ordens e consultar viabilidade                                   |
| `order.operator`   | Executar designação, avançar estado de ordem                           |
| `catalog.admin`    | Manter catálogos (Specifications, RelationshipTypes) — C9              |
| `tenant.admin`     | Gerir usuários do próprio tenant                                       |
| `platform.admin`   | **Cross-tenant**; exclusivo da operação V.tal, com auditoria reforçada |

**Regra:** autorização é verificada na **camada de serviço**, não no handler HTTP. O handler traduz
protocolo; quem conhece a regra é o domínio.

---

## 4. Isolamento multi-tenant — imposto, não combinado

O filtro por tenant **não pode depender** de cada desenvolvedor lembrar de escrever
`WHERE tenant_id = ?`. Uma query esquecida vaza dado entre concorrentes.

**Duas camadas, ambas obrigatórias:**

### 4.1 Oracle VPD (Virtual Private Database)

Política aplicada no banco, transparente ao SQL da aplicação:

```sql
-- Predicado injetado automaticamente em toda consulta às tabelas de inventário
FUNCTION tenant_predicate(schema VARCHAR2, obj VARCHAR2) RETURN VARCHAR2 IS
BEGIN
  IF SYS_CONTEXT('NEXUS_CTX','IS_PLATFORM_ADMIN') = 'Y' THEN RETURN NULL; END IF;
  RETURN 'tenant_id = SYS_CONTEXT(''NEXUS_CTX'',''TENANT_ID'')';
END;
```

O adaptador define o contexto (`DBMS_SESSION.SET_CONTEXT`) ao pegar a conexão do pool e **o limpa ao
devolvê-la** — conexão reutilizada com contexto de outro tenant é o modo clássico de falha desse
padrão.

### 4.2 Filtro no adaptador

Defesa em profundidade: o repositório recebe o `tenantId` do contexto da requisição e o aplica
explicitamente. VPD protege contra query esquecida; o filtro explícito protege contra falha de
configuração do VPD.

> **Teste obrigatório:** suíte de segurança que, para cada endpoint, tenta ler um recurso de outro
> tenant e exige `404` (não `403` — a existência do recurso já é informação).

---

## 5. Auditoria

Toda escrita registra **quem, o quê, quando, de onde**:

| Campo                       | Origem                  |
| --------------------------- | ----------------------- |
| `actor_sub`                 | Claim `sub`             |
| `tenant_id`                 | Claim `tenant_id`       |
| `action`                    | Caso de uso             |
| `entity_type` / `entity_id` | Alvo                    |
| `before` / `after`          | Diff do estado          |
| `trace_id`                  | Correlação              |
| `source_ip`                 | Encaminhado pelo Apigee |

A trilha é **imutável** (append-only) e publicada em Kafka junto ao evento TMF688 — o mesmo outbox
que garante atomicidade do evento garante a da auditoria (C7).

Operação de `platform.admin` cruzando tenant gera registro com marcação especial e alerta.

---

## 6. Proteção de dados e LGPD

O Nexus guarda **22 milhões de endereços residenciais** e dados de assinante — base sujeita à
**LGPD**.

| Requisito                    | Tratamento                                                                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Minimização**              | O Nexus é inventário de rede. Dado pessoal do consumidor final pertence ao ISP; o Nexus guarda o **endereço** e o `SubscriberID` do ISP, não o CPF do morador |
| **Criptografia em repouso**  | Oracle **TDE** nas tablespaces de inventário e ordem                                                                                                          |
| **Criptografia em trânsito** | TLS 1.2+ em toda borda; mTLS Apigee ↔ OpenShift                                                                                                               |
| **Mascaramento**             | **Data Redaction** para papéis sem necessidade de ver endereço completo                                                                                       |
| **Ambientes não-produtivos** | Subsetting + mascaramento na carga; nunca cópia crua de produção                                                                                              |
| **Retenção**                 | Ver ciclo de vida em [`data-model.md`](data-model.md) §6                                                                                                      |
| **Direito do titular**       | Atendido via ISP (controlador); o Nexus é operador                                                                                                            |

> Registrar formalmente o papel do Nexus como **operador** (não controlador) na cadeia LGPD é
> pendência jurídica a confirmar com a área de Privacidade.

---

## 7. Segredos e configuração

| Item              | Onde                                 | Regra                               |
| ----------------- | ------------------------------------ | ----------------------------------- |
| Credencial Oracle | **Oracle Wallet** + OpenShift Secret | Nunca em variável de ambiente plana |

Na fase de paridade de persistência, `ORACLE_PASSWORD` é injetada exclusivamente por Secret do
ambiente e nunca registrada em log. O usuário do runtime possui somente DML; migrations de produção
usam uma credencial DDL separada. Wallet/mTLS e VPD continuam no hardening posterior.
| Chaves de API | OpenShift Secret / Vault | Rotação automatizada |
| Certificados mTLS | cert-manager | Renovação automática |
| Configuração não sensível | ConfigMap | Substitui o `.env` do laboratório |

> ⚠️ O laboratório usa `.env` com `DATABASE_URL`, `AUTH_TOKEN` e `OPENAI_API_KEY` — aceitável só
> enquanto for laboratório. O arquivo está no `.gitignore` e **não deve** ser replicado em OpenShift.

Também no laboratório, `scripts/dev-neon.mjs` define `NODE_TLS_REJECT_UNAUTHORIZED=0` para atravessar
o proxy corporativo. **Isso desabilita validação de certificado e jamais pode ir para produção** —
deve ser removido na migração.

---

## 8. Segurança de rede e plataforma

| Camada | Controle                                                                              |
| ------ | ------------------------------------------------------------------------------------- |
| Borda  | Apigee: WAF, spike arrest, quota, validação de schema                                 |
| Malha  | NetworkPolicy no OpenShift: `nexus-api` não fala direto com Kafka; só o relay publica |
| Pod    | `runAsNonRoot`, filesystem read-only, sem privilégio                                  |
| Imagem | Scan de vulnerabilidade no pipeline; base image corporativa                           |
| Kafka  | SASL/SCRAM + TLS; ACL por tópico e consumer group                                     |
| Redis  | TLS + AUTH; **nunca** armazena dado pessoal, só chaves derivadas e agregados          |

---

## 9. Ordem de correção

| #   | Ação                                                    | Depende de          |
| --- | ------------------------------------------------------- | ------------------- |
| 1   | Aceitar e validar JWT com claims (`tenant_id`, `roles`) | Apigee provisionado |
| 2   | Propagar contexto de tenant até o adaptador             | 1                   |
| 3   | RBAC na camada de serviço                               | 1                   |
| 4   | VPD no Oracle + limpeza de contexto no pool             | Migração Oracle     |
| 5   | Trilha de auditoria no outbox                           | Outbox (C7)         |
| 6   | Suíte de teste de isolamento entre tenants              | 2                   |
| 7   | TDE, Data Redaction e mascaramento de não-produtivos    | Migração Oracle     |

Os itens 1–3 **não dependem da migração Oracle** e podem começar imediatamente.

---

## 10. Referências

| Onde                                                                 | O quê                                         |
| -------------------------------------------------------------------- | --------------------------------------------- |
| [`architecture.md`](architecture.md)                                 | Apigee, OpenShift, pool e contexto de conexão |
| [`data-model.md`](data-model.md)                                     | `tenant_id`, particionamento e retenção       |
| [`non-functional-requirements.md`](non-functional-requirements.md)   | Disponibilidade e observabilidade             |
| [`../1-overview/business-rules.md`](../1-overview/business-rules.md) | C8 — multi-tenant e wholesale                 |

---

_V.tal Nexus — Documento Confidencial — Uso Interno — PÚBLICA_
