# Sistemas de referência — benchmark para as specs

> Playbook de escrita. Leia este arquivo **apenas ao preencher a seção N.9 de um requisito** (`Mapeamento contra sistemas de referência`). Para as regras sempre válidas, veja `AGENTS.md`.

Toda seção N.9 de requisito traz uma tabela comparando a capacidade nos três inventários de benchmark e a decisão do Nexus:

| Capacidade | Netwin | Kuwaiba | NetBox | Decisão Nexus |
|---|---|---|---|---|

**Use os arquivos originais como fonte — não invente comportamento.** Eles estão em `inspirations/`.
Quando a fonte não demonstrar uma capacidade, escreva **“Não identificado no levantamento”**. Ausência
no levantamento não prova inexistência no produto; evite `Não`, `Inexistente` ou `N/A` como inferência
categórica.

---

## O que cada sistema representa

| Sistema | Papel no benchmark | Fonte |
|---|---|---|
| **Netwin** (Altice Labs) | Legado primário a substituir | `inspirations/netwin.md` |
| **Kuwaiba** (open-source) | Metamodelo de classes hierárquicas | `inspirations/kuwaiba.md` |
| **NetBox** (open-source) | DCIM/IPAM resource-centric — o contraste | `inspirations/netbox.md` |

### Fontes complementares (não viram coluna)

| Fonte | Papel | Como usar |
|---|---|---|
| `inspirations/nossis.md` | **NOSSIS One Inventory** (Altice Labs) — evolução direta do Netwin, com a mesma base funcional declarada. É o sistema referido como "Networks" nas consultas com a operação. | Lê-se **junto com `netwin.md`** ao preencher a coluna **Netwin**. Quando as duas fontes divergirem, registre a divergência na célula em vez de escolher uma. |
| `inspirations/geosite-legado.md` | **Geosite-Legado** — inventário georreferenciado de planta externa; entra como **anti-referência**, derivada de consulta operacional, não de levantamento de telas. | Alimenta o racional **N.2** e a coluna **Decisão Nexus**. Nunca vira coluna própria: a fonte registra percepção de operação, não comportamento verificado. |

O cabeçalho das tabelas N.9 permanece com as quatro colunas acima — não o altere.

### Netwin (Altice Labs)

Legado primário a substituir. Cobre todos os domínios (Location, OSP, ISP, Network & Services, Provisioning, Reports, Catalogue). O módulo *Network & Services* já separa "serviços de cliente" / "serviços de rede" (proto CFS/RFS); *Resource Provisioning* tem Viabilidade GPON.

### Kuwaiba (open-source)

Metamodelo de classes hierárquicas. *Service Manager* + *Contract Manager*; `GenericService` associado a circuitos via relação `uses`. Não tem split CFS/RFS limpo do SID. Connectivity Manager com path computation.

### NetBox (open-source)

DCIM/IPAM resource-centric. O levantamento identificou L2VPN, Circuits e Application Services como
objetos adjacentes, mas não um Service Inventory CFS/RFS alinhado ao SID. É o contraste para construir
domínios de serviço/ordem no Nexus sem esticar uma ferramenta DCIM.

---

*V.tal Nexus — Documento Confidencial — Uso Interno — PÚBLICA*
