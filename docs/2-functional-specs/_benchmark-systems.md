# Sistemas de referência — benchmark para as specs

> Playbook de escrita. Leia este arquivo **apenas ao preencher a seção N.9 de um requisito** (`Mapeamento contra sistemas de referência`). Para as regras sempre válidas, veja `AGENTS.md`.

Toda seção N.9 de requisito traz uma tabela comparando a capacidade nos três inventários de benchmark e a decisão do Nexus:

| Capacidade | Netwin | Kuwaiba | NetBox | Decisão Nexus |
|---|---|---|---|---|

**Use os arquivos originais como fonte — não invente comportamento.** Eles estão em `reference-systems/`.

---

## O que cada sistema representa

| Sistema | Papel no benchmark | Fonte |
|---|---|---|
| **Netwin** (Altice Labs) | Legado primário a substituir | `reference-systems/netwin.md` |
| **Kuwaiba** (open-source) | Metamodelo de classes hierárquicas | `reference-systems/kuwaiba.md` |
| **NetBox** (open-source) | DCIM/IPAM resource-centric — o contraste | `reference-systems/netbox.md` |

### Netwin (Altice Labs)

Legado primário a substituir. Cobre todos os domínios (Location, OSP, ISP, Network & Services, Provisioning, Reports, Catalogue). O módulo *Network & Services* já separa "serviços de cliente" / "serviços de rede" (proto CFS/RFS); *Resource Provisioning* tem Viabilidade GPON.

### Kuwaiba (open-source)

Metamodelo de classes hierárquicas. *Service Manager* + *Contract Manager*; `GenericService` associado a circuitos via relação `uses`. Não tem split CFS/RFS limpo do SID. Connectivity Manager com path computation.

### NetBox (open-source)

DCIM/IPAM resource-centric. **Não tem service inventory** (L2VPN/Circuits/Application Services são resource-adjacent). É o contraste que justifica construir domínios de serviço/ordem no Nexus, em vez de esticar uma ferramenta DCIM.

---

*V.tal Nexus — Documento Confidencial — Uso Interno — PÚBLICA*
