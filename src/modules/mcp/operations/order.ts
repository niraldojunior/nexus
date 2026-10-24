// Operações de Order via MCP. Papéis iguais aos de routeOrderRequest: leitura ORDER_READ,
// criação ORDER_REQUEST, alteração/cancelamento ORDER_OPERATE. create_service_order,
// create_resource_order e check_service_qualification já existem em module.ts.

import { ORDER_OPERATE_ROLES, ORDER_READ_ROLES } from '../../../shared/http/roles.js';
import type { NexusRuntime } from '../../../shared/runtime/nexus-runtime.js';
import type { McpToolRegistry } from '../module.js';
import { createOperationHelpers, idSchema, payloadOf, s, updateSchema } from './helpers.js';

const querySchema = { type: 'object', properties: {}, additionalProperties: true } as const;

export const registerOrderOperations = (registry: McpToolRegistry, runtime: NexusRuntime): void => {
  const svc = runtime.orderService;
  const { read, simpleWrite } = createOperationHelpers(registry, 'order', {
    read: ORDER_READ_ROLES,
    write: ORDER_OPERATE_ROLES,
  });

  read(
    'list_service_qualifications',
    'Lista consultas de viabilidade (TMF645).',
    querySchema,
    (i, c) => svc.listServiceQualifications(i as never, c.requestContext),
  );
  read('get_service_qualification', 'Obtém uma consulta de viabilidade.', idSchema(), (i, c) =>
    svc.getServiceQualification(s(i.id), c.requestContext),
  );
  read('list_service_orders', 'Lista ordens de serviço (TMF641).', querySchema, (i, c) =>
    svc.listServiceOrders(i as never, c.requestContext),
  );
  read('get_service_order', 'Obtém uma ordem de serviço.', idSchema(), (i, c) =>
    svc.getServiceOrder(s(i.id), c.requestContext),
  );
  read('list_resource_orders', 'Lista ordens de recurso (TMF652).', querySchema, (i, c) =>
    svc.listResourceOrders(i as never, c.requestContext),
  );
  read('get_resource_order', 'Obtém uma ordem de recurso.', idSchema(), (i, c) =>
    svc.getResourceOrder(s(i.id), c.requestContext),
  );

  simpleWrite(
    'update_service_qualification',
    'atualiza uma consulta de viabilidade.',
    updateSchema,
    (i) => `Viabilidade ${s(i.id)} será atualizada.`,
    (i, c) => svc.updateServiceQualification(s(i.id), payloadOf(i), c.requestContext),
  );
  simpleWrite(
    'delete_service_qualification',
    'remove uma consulta de viabilidade.',
    idSchema(),
    (i) => `Viabilidade ${s(i.id)} será removida.`,
    (i, c) => svc.deleteServiceQualification(s(i.id), c.requestContext),
  );
  simpleWrite(
    'update_service_order',
    'atualiza uma ordem de serviço (designação, avanço de estado).',
    updateSchema,
    (i) => `Ordem de serviço ${s(i.id)} será atualizada.`,
    (i, c) => svc.updateServiceOrder(s(i.id), payloadOf(i), c.requestContext),
  );
  simpleWrite(
    'cancel_service_order',
    'cancela uma ordem de serviço.',
    idSchema(),
    (i) => `Ordem de serviço ${s(i.id)} será cancelada.`,
    (i, c) => svc.cancelServiceOrder(s(i.id), c.requestContext),
  );
  simpleWrite(
    'update_resource_order',
    'atualiza uma ordem de recurso.',
    updateSchema,
    (i) => `Ordem de recurso ${s(i.id)} será atualizada.`,
    (i, c) => svc.updateResourceOrder(s(i.id), payloadOf(i), c.requestContext),
  );
  simpleWrite(
    'cancel_resource_order',
    'cancela uma ordem de recurso.',
    idSchema(),
    (i) => `Ordem de recurso ${s(i.id)} será cancelada.`,
    (i, c) => svc.cancelResourceOrder(s(i.id), c.requestContext),
  );
};
