# Design de Sistema - Integrações

## Design Orientado a Eventos

- Tratar eventos como contrato de integração, não como detalhe secundário.
- Separar a publicação de eventos do fluxo principal de escrita.
- Usar dispatchers ou consumers dedicados quando houver fan-out ou integração assíncrona.
- Versionar eventos e manter estáveis os nomes canônicos.
- Preferir integração assíncrona para notificações, analytics e consumidores downstream.

## Fronteiras de Integração

- Definir contratos claros entre módulos antes de conectar os fluxos de integração.
- Manter dependências síncronas explícitas e mínimas.
- Usar eventos assíncronos para propagação entre módulos quando o acoplamento pudesse crescer.
- Documentar o que é produzido, o que é consumido e o que é apenas observado.
- Favorecer interoperabilidade por meio de contratos bem definidos em vez de efeitos colaterais implícitos.

## Padrão Observado na Plataforma

- O codebase atual já inclui suporte a RMQ.
- O despacho de notificações é modelado como módulo próprio.
- Assinantes no estilo Hub são usados para fan-out de eventos no domínio de resource catalog.
- A publicação de eventos deve permanecer versionada e específica do domínio.
