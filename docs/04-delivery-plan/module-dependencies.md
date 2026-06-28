# Dependências Entre Módulos

> Data base: 27/06/2026

## 1. Grafo Lógico

```text
MOD06 Party & Tenant
  ^      ^       ^
  |      |       |
MOD01 -> MOD02 -> MOD03
  |       |       |
  v       v       v
MOD04 Order & Fulfillment
  |
  v
MOD05 Process Orchestration

MOD01, MOD02, MOD03, MOD04, MOD05 -> MOD07 Analytics & Events
MOD01, MOD02, MOD03, MOD04, MOD05, MOD06, MOD07 -> MOD08 Platform & Admin
```

Leitura do grafo:

- MOD01 é a fundação geográfica consumida por Resource, Service e Order.
- MOD02 depende de MOD01 via `place` e é consumido por Service via `supportingResource`.
- MOD03 depende de MOD01, MOD02 e MOD06; no MVP a validação de MOD06 pode ser diferida conforme D-3.
- MOD04 cria/altera Services e executa viabilidade TMF645 sobre Geo + Resource.
- MOD05 orquestra workflows críticos, principalmente swap, decommissioning e ativações complexas.
- MOD07 consome eventos TMF688.
- MOD08 fornece RBAC, audit e administração transversal.

## 2. Matriz De Dependências

| Produtor | Consumidor | Tipo | Contrato | Bloqueio |
|---|---|---|---|---|
| MOD01 Geographic | MOD02 Resource | Síncrono + assíncrono | `place` para GeographicSite/Location; eventos de status. | Bloqueia criação correta de Resource. |
| MOD01 Geographic | MOD03 Service | Síncrono | `place` / instalação por GeographicAddress ou Site. | Bloqueia ativação de serviço por localização. |
| MOD01 Geographic | MOD04 Order | Síncrono | Endereço, site e coordenada para TMF645. | Bloqueia viabilidade e ordens por endereço. |
| MOD02 Resource | MOD03 Service | Síncrono + assíncrono | `supportingResource`, ResourceStateChange, impact analysis. | Bloqueia RFS real e análise de impacto. |
| MOD02 Resource | MOD04 Order | Síncrono | Reserva, disponibilidade, TMF664 activation. | Bloqueia fulfillment. |
| MOD02 Resource | MOD05 Process | Síncrono | Tasks BPMN para swap/decommissioning. | Bloqueia operações críticas automatizadas. |
| MOD06 Party | MOD01 Geographic | Síncrono | `relatedParty` owner/tenant. | Pode ser mínimo no MVP. |
| MOD06 Party | MOD02 Resource | Síncrono | manufacturer, vendor, owner, tenant. | Bloqueia governança completa de catálogo e inventário. |
| MOD06 Party | MOD03 Service | Síncrono | `relatedParty[subscriber]`. | Validação diferida no MVP por D-3. |
| MOD04 Order | MOD03 Service | Síncrono + eventos | `serviceOrderItem`, criação/alteração de Service. | Bloqueia Service lifecycle automatizado. |
| MOD05 Process | MOD02/MOD03/MOD04 | Síncrono | Workflow instance e tasks BPMN. | Bloqueia fluxos complexos e aprovação humana. |
| MOD01-MOD05 | MOD07 Analytics | Assíncrono | TMF688 versionado. | Bloqueia Data Lake, dashboards e SA baseada em evento. |
| MOD01-MOD07 | MOD08 Platform | Síncrono | RBAC, audit, administração de catálogo. | Bloqueia governança e produção segura. |

## 3. Contratos Canônicos

| Contrato | Dono | Consumidores | Regra |
|---|---|---|---|
| `place` | MOD01 | MOD02, MOD03, MOD04 | Referência canônica para Site/Address/Location; não embutir geografia em Resource ou Service. |
| `supportingResource` | MOD02 | MOD03 | Service referencia Resource; Service nunca copia atributos físicos/lógicos. |
| `supportingService` | MOD03 | MOD03/MOD04 | CFS referencia RFS; CFS nunca referencia Resource diretamente. |
| `relatedParty` | MOD06 | Todos | Owner, tenant, subscriber, manufacturer e vendor são Party/PartyRole. |
| `_origin` | Transversal | Migração, suporte, audit | IDs legados são characteristics read-only; UUID v7 Nexus é identidade canônica. |
| TMF688 | Transversal/MOD07 | Analytics, SA, Order, BSS | Eventos por outbox, idempotentes, versionados em Schema Registry. |
| RBAC/Audit | MOD08 | Todos | Toda escrita relevante exige autorização e audit trail. |

## 4. Caminhos Críticos

### Caminho crítico Netwin - Dez/2026

```text
System design alinhado
  -> MOD01 foundation
  -> MOD02 foundation
  -> outbox + audit + _origin
  -> migração Netwin wave 1
  -> operação Região 1
```

### Caminho crítico Service - Mar/2027

```text
MOD01 + MOD02 em produção
  -> MOD06 mínimo ou reconciliação diferida
  -> MOD03 Service Catalog + Service Inventory
  -> MOD04 Order/TMF645 mínimo
  -> SubscriberID Nexus-native
```

### Caminho crítico NetworkCore - Mai/2027

```text
MOD01/MOD02 estáveis
  -> modelo OSP completo
  -> Property Graph dimensionado
  -> pipeline NetworkCore + Octave EAM
  -> validação operacional Região 2
```

## 5. Dependências Bloqueantes A Resolver

| ID | Dependência | Bloqueia | Fonte |
|---|---|---|---|
| DEP-001 | Stack Oracle 21c/23ai + Property Graph dimensionada. | Path computation e escala 22M+ HPs. | C10, Q-RES-004. |
| DEP-002 | Kafka/outbox/Schema Registry definidos no design técnico. | Eventos TMF688 em produção. | C7, REQ-MOD01-012, REQ-MOD02-025, REQ-MOD03-016. |
| DEP-003 | Catálogo inicial de SiteSpecification e ResourceSpecification. | Bootstrap MOD01/MOD02. | Q-GEO-001, Q-RES-001. |
| DEP-004 | Estratégia de Geosite Logradouros e geocodificação. | Address e mapa. | Q-GEO-005, Q-GEO-009. |
| DEP-005 | Estratégia IPAM legado. | LogicalResource IP/VRF/VLAN. | Q-RES-008. |
| DEP-006 | Definição de ServiceSpecification e SubscriberID. | MOD03/MOD04/MOD06. | Q-SVC-001, Q-SVC-002. |
| DEP-007 | RBAC/audit mínimo. | Produção de qualquer módulo. | C8, MOD08, security.md. |

---

*V.tal Nexus - Documento Confidencial - Uso Interno - PÚBLICA*
