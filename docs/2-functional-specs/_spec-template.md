# Template de functional spec (HLD de módulo)

> Playbook de escrita. Leia este arquivo **apenas quando for criar ou editar uma functional spec** em `docs/2-functional-specs/`. Para as regras sempre válidas (cânone C1–C10, tríade, idioma), veja `AGENTS.md`.

Gabaritos de referência: `02-module-resource.md` e `03-module-service.md`.

---

## 1. Anatomia do documento

Replique **exatamente** esta espinha:

1. **Cabeçalho** — tabela: Document Reference (`VTN-HLD-MODxx-XXX`), versão, data, âncora, predecessores, TMFCs, Open APIs, requisitos cobertos, status.
2. **Propósito do módulo** — o que responde; posição na tríade.
3. **Escopo** — `2.1 Dentro do escopo` / `2.2 Fora do escopo (tratado em outros módulos)`.
4. **Modelo conceitual TMF** — tabela de entidades + hierarquia de tipos (ASCII) + fronteiras com módulos vizinhos.
5. **Princípios de design do módulo** — 6–9 princípios curtos.
6. **Resumo dos requisitos** — blocos (A, B, C…) + tabela completa + ordem de implementação.
7. **Um bloco por requisito** (ver §2 abaixo).
8. **Cenários ilustrativos** — 2–3 cenários ASCII end-to-end atravessando os 3 módulos + padrões reaproveitáveis.
9. **Síntese arquitetural.**
10. **Contratos com outros módulos** — tabela Módulo × tipo de consumo × detalhe.
11. **Questões em aberto** — tabela Q-xxx (Aberta / ✅ Decidido) + decisões resolvidas + seção `_origin` com payload de exemplo.
12. **Controle de revisões.**
13. Rodapé: `*V.tal Nexus — Documento Confidencial — Uso Interno — PÚBLICA*`

---

## 2. Template de requisito (9 sub-itens — obrigatório)

Cada `REQ-MODxx-NNN` tem **exatamente** estas 9 sub-seções, nesta ordem:

```
## N. REQ-MODxx-NNN — <Título>
> Entidade TMF · Open API TMF · Prioridade · Status

### N.1 Descrição
### N.2 Racional arquitetural
### N.3 Mapeamento de atributos TMF        (tabela: Atributo | Tipo | Obrigatório | Observação V.tal)
### N.4 Exemplo de payload                  (JSON realista com place/supportingResource/supportingService)
### N.5 Pré-condições
### N.6 Requisitos Funcionais               (tabela RF-001…: ID | Nome | Descrição)
### N.7 Regras de Negócio                   (tabela RN-001…: ID | Regra)
### N.8 Critérios de Aceite                 (tabela CA-001…: ID | Critério | Resultado Esperado)
### N.9 Mapeamento contra sistemas de referência   (ver `_benchmark-systems.md`)
```

Requisitos **ilustrativos** (serviços ou cenários concretos como GPON, CloudVoIP) usam variante enxuta: Descrição → Racional → Modelagem de referência → Características → RF → CA → Mapeamento.

---

## 3. Método de validação — "exercitar a tese"

Antes de fechar um requisito ou modelo, **exercite-o contra um cenário operacional real** da V.tal. Se o modelo não sustenta o cenário, ele não está pronto.

Cenários já validados e documentados:

| Cenário | Onde está |
|---|---|
| Home Passed → Home Connected → ONT → Serviço | `../1-overview/product-overview.md` §8.1 |
| Central Office GPON — hierarquia OLT→Card→Porta→DIO→Cabo→Splitter→CTO→ONT | `02-module-resource.md` §31.2 |
| Cliente corporativo em condomínio empresarial (VRF + CPE + porta) | `02-module-resource.md` §31.1 |
| Banda larga residencial via ISP (wholesale Bitstream) | `03-module-service.md` §22.1 |
| Link dedicado multiponto L3VPN (CFS→RFS acesso+transporte+backbone) | `03-module-service.md` §22.2 |
| CloudVoIP sobre link empresarial (serviceRelationship dependsOn) | `03-module-service.md` §22.3 |

---

## 4. Ao fechar a edição

- Atualize o **Controle de revisões** do documento editado.
- Reflita o impacto no `../1-overview/product-overview.md` (status do módulo, questões consolidadas).

---

*V.tal Nexus — Documento Confidencial — Uso Interno — PÚBLICA*
