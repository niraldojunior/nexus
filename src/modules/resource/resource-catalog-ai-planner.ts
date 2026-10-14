import { createHash } from 'node:crypto';
import { AppError } from '../../shared/errors/app-error.js';
import type {
  ResourceCatalogAiChangeKind,
  ResourceCatalogAiCounters,
  ResourceCatalogAiOperation,
  ResourceCatalogAiProjectedNode,
  ResourceCatalogAiProposal,
  ResourceCatalogNode,
  ResourceCatalogNodeKind,
  ResourceCatalogStatus,
} from './domain.js';

/**
 * Parte determinística da otimização por IA (issue #365): parse estrito da proposta, validação
 * estrutural, simulação em memória, checksum e árvore projetada. Nada aqui fala com LLM nem com
 * persistência — o mesmo código roda na prévia e, de novo, no apply (nunca se confia no cliente).
 */

export const AI_TEMP_REF_PATTERN = /^new:[a-z0-9][a-z0-9-]{0,63}$/;
export const AI_MAX_OPERATIONS = 500;
export const AI_MAX_ACTIVE_NODES = 2000;
const MAX_NAME_LENGTH = 120;
const MAX_TEXT_LENGTH = 1000;
const CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;

export const invalidProposal = (message: string): AppError =>
  new AppError(`invalid AI proposal: ${message}`, {
    code: 'RESOURCE_CATALOG_AI_INVALID_PROPOSAL',
    statusCode: 422,
  });

// ---------------------------------------------------------------------------------------------
// Checksum
// ---------------------------------------------------------------------------------------------

/**
 * SHA-256 sobre uma serialização canônica (tuplas em ordem fixa, linhas ordenadas por ID).
 * Inclui nós inativos porque a unicidade de `code` depende deles.
 */
export const computeCatalogChecksum = (catalogId: string, nodes: ResourceCatalogNode[]): string => {
  const rows = nodes
    .map((node) => [
      node.id,
      node.parentNodeId ?? null,
      node.kind,
      node.code,
      node.name,
      node.description ?? '',
      node.status,
      node.sortOrder,
      node.resourceTypeId ?? null,
    ])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return createHash('sha256')
    .update(JSON.stringify([catalogId, rows]))
    .digest('hex');
};

// ---------------------------------------------------------------------------------------------
// Parse estrito
// ---------------------------------------------------------------------------------------------

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const assertKeys = (value: Record<string, unknown>, allowed: string[], where: string): void => {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw invalidProposal(`unexpected field "${key}" in ${where}`);
  }
};

const readString = (
  value: Record<string, unknown>,
  key: string,
  where: string,
  options: { max: number; allowEmpty?: boolean } = { max: MAX_TEXT_LENGTH },
): string => {
  const raw = value[key];
  if (typeof raw !== 'string') throw invalidProposal(`"${key}" must be a string in ${where}`);
  const trimmed = raw.trim();
  if (!options.allowEmpty && trimmed.length === 0) {
    throw invalidProposal(`"${key}" must not be empty in ${where}`);
  }
  if (trimmed.length > options.max) throw invalidProposal(`"${key}" is too long in ${where}`);
  return trimmed;
};

const readOptionalString = (
  value: Record<string, unknown>,
  key: string,
  where: string,
  max: number,
  allowEmpty = false,
): string | undefined =>
  value[key] === undefined ? undefined : readString(value, key, where, { max, allowEmpty });

const readParentRef = (
  value: Record<string, unknown>,
  key: string,
  where: string,
): string | null => {
  const raw = value[key];
  if (raw === null) return null;
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    throw invalidProposal(`"${key}" must be a node reference or null in ${where}`);
  }
  return raw.trim();
};

const parseOperation = (raw: unknown, index: number): ResourceCatalogAiOperation => {
  const where = `operation #${index + 1}`;
  if (!isRecord(raw)) throw invalidProposal(`${where} must be an object`);
  const type = raw.type;
  switch (type) {
    case 'create': {
      assertKeys(raw, ['type', 'ref', 'kind', 'name', 'code', 'description', 'parentRef'], where);
      const ref = readString(raw, 'ref', where, { max: 80 });
      if (!AI_TEMP_REF_PATTERN.test(ref)) {
        throw invalidProposal(`"ref" must match new:<slug> in ${where}`);
      }
      const kind = raw.kind;
      if (kind !== 'GROUP' && kind !== 'RESOURCE_TYPE') {
        throw invalidProposal(`"kind" must be GROUP or RESOURCE_TYPE in ${where}`);
      }
      const code = readOptionalString(raw, 'code', where, 80);
      if (code !== undefined && !CODE_PATTERN.test(code)) {
        throw invalidProposal(`"code" has an invalid format in ${where}`);
      }
      const description = readOptionalString(raw, 'description', where, MAX_TEXT_LENGTH, true);
      return {
        type: 'create',
        ref,
        kind,
        name: readString(raw, 'name', where, { max: MAX_NAME_LENGTH }),
        ...(code ? { code } : {}),
        ...(description ? { description } : {}),
        parentRef: readParentRef(raw, 'parentRef', where),
      };
    }
    case 'rename': {
      assertKeys(raw, ['type', 'nodeRef', 'name', 'description'], where);
      const name = readOptionalString(raw, 'name', where, MAX_NAME_LENGTH);
      const description = readOptionalString(raw, 'description', where, MAX_TEXT_LENGTH, true);
      if (name === undefined && description === undefined) {
        throw invalidProposal(`rename needs "name" or "description" in ${where}`);
      }
      return {
        type: 'rename',
        nodeRef: readString(raw, 'nodeRef', where, { max: 80 }),
        ...(name !== undefined ? { name } : {}),
        ...(description !== undefined ? { description } : {}),
      };
    }
    case 'move': {
      assertKeys(raw, ['type', 'nodeRef', 'parentRef'], where);
      return {
        type: 'move',
        nodeRef: readString(raw, 'nodeRef', where, { max: 80 }),
        parentRef: readParentRef(raw, 'parentRef', where),
      };
    }
    case 'reorder': {
      assertKeys(raw, ['type', 'parentRef', 'orderedRefs'], where);
      const ordered = raw.orderedRefs;
      if (!Array.isArray(ordered) || ordered.length === 0) {
        throw invalidProposal(`"orderedRefs" must be a non-empty array in ${where}`);
      }
      const orderedRefs = ordered.map((item) => {
        if (typeof item !== 'string' || item.trim().length === 0) {
          throw invalidProposal(`"orderedRefs" must contain only references in ${where}`);
        }
        return item.trim();
      });
      return { type: 'reorder', parentRef: readParentRef(raw, 'parentRef', where), orderedRefs };
    }
    case 'inactivate': {
      assertKeys(raw, ['type', 'nodeRef'], where);
      return { type: 'inactivate', nodeRef: readString(raw, 'nodeRef', where, { max: 80 }) };
    }
    default:
      throw invalidProposal(`${where} has an unknown type`);
  }
};

export const parseOperations = (raw: unknown): ResourceCatalogAiOperation[] => {
  if (!Array.isArray(raw)) throw invalidProposal('"operations" must be an array');
  if (raw.length > AI_MAX_OPERATIONS) {
    throw invalidProposal(`too many operations (max ${AI_MAX_OPERATIONS})`);
  }
  return raw.map((item, index) => parseOperation(item, index));
};

/** Parse da resposta do LLM (sem identidade de proposta — o servidor a atribui). */
export const parseLlmProposalArguments = (
  raw: unknown,
): { summary: string; rationale: string; operations: ResourceCatalogAiOperation[] } => {
  if (!isRecord(raw)) throw invalidProposal('the model response must be an object');
  assertKeys(raw, ['summary', 'rationale', 'operations'], 'proposal');
  return {
    summary: readString(raw, 'summary', 'proposal', { max: 600 }),
    rationale: readString(raw, 'rationale', 'proposal', { max: 4000 }),
    operations: parseOperations(raw.operations),
  };
};

/** Parse do body do apply: a proposta opaca devolvida pela prévia. */
export const parseProposalEnvelope = (raw: unknown): ResourceCatalogAiProposal => {
  if (!isRecord(raw)) throw invalidProposal('the proposal must be an object');
  const body = isRecord(raw.proposal) ? raw.proposal : raw;
  assertKeys(
    body,
    ['proposalId', 'catalogId', 'baselineChecksum', 'summary', 'rationale', 'operations'],
    'proposal',
  );
  return {
    proposalId: readString(body, 'proposalId', 'proposal', { max: 80 }),
    catalogId: readString(body, 'catalogId', 'proposal', { max: 80 }),
    baselineChecksum: readString(body, 'baselineChecksum', 'proposal', { max: 80 }),
    summary: readString(body, 'summary', 'proposal', { max: 600 }),
    rationale: readString(body, 'rationale', 'proposal', { max: 4000 }),
    operations: parseOperations(body.operations),
  };
};

// ---------------------------------------------------------------------------------------------
// Simulação
// ---------------------------------------------------------------------------------------------

export type AiPlanNode = {
  id: string;
  kind: ResourceCatalogNodeKind;
  code: string;
  name: string;
  description?: string;
  status: ResourceCatalogStatus;
  parentId: string | null;
  sortOrder: number;
  isNew: boolean;
  original?: ResourceCatalogNode;
  changes: Set<ResourceCatalogAiChangeKind>;
  /** Ordem de criação (apenas nós novos), que garante pai antes do filho no apply. */
  createIndex?: number;
};

export type AiPlan = {
  nodes: Map<string, AiPlanNode>;
  /** Refs `new:*` na ordem das operações `create`. */
  createdRefs: string[];
  counters: ResourceCatalogAiCounters;
  projectedTree: ResourceCatalogAiProjectedNode[];
};

const slugify = (value: string): string => {
  const slug = value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'item';
};

const byOrder = (a: ResourceCatalogNode, b: ResourceCatalogNode): number =>
  a.sortOrder - b.sortOrder || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);

/**
 * Valida e simula as operações sobre a hierarquia atual. `nodes` deve conter **todos** os nós do
 * catálogo (inclusive inativos); só os ativos podem ser alvo de operação.
 */
export const planAiOperations = (
  nodes: ResourceCatalogNode[],
  operations: ResourceCatalogAiOperation[],
): AiPlan => {
  const state = new Map<string, AiPlanNode>();
  const children = new Map<string | null, string[]>();
  const usedCodes = new Set(nodes.map((node) => node.code.toLowerCase()));

  const listOf = (parentId: string | null): string[] => {
    let list = children.get(parentId);
    if (!list) {
      list = [];
      children.set(parentId, list);
    }
    return list;
  };

  for (const node of [...nodes].sort(byOrder)) {
    state.set(node.id, {
      id: node.id,
      kind: node.kind,
      code: node.code,
      name: node.name,
      ...(node.description ? { description: node.description } : {}),
      status: node.status,
      parentId: node.parentNodeId ?? null,
      sortOrder: node.sortOrder,
      isNew: false,
      original: node,
      changes: new Set(),
    });
    if (node.status === 'active') listOf(node.parentNodeId ?? null).push(node.id);
  }
  if ([...state.values()].filter((node) => node.status === 'active').length > AI_MAX_ACTIVE_NODES) {
    throw new AppError('resource catalog is too large for AI optimization', {
      code: 'RESOURCE_CATALOG_AI_TOO_LARGE',
      statusCode: 422,
    });
  }

  const createdRefs: string[] = [];
  const touchedParents = new Set<string | null>();
  const originalParentOrder = new Map<string, string[]>();
  for (const [parentId, list] of children) originalParentOrder.set(String(parentId), [...list]);

  const activeNode = (ref: string, where: string): AiPlanNode => {
    const node = state.get(ref);
    if (!node) throw invalidProposal(`unknown node "${ref}" in ${where}`);
    if (node.status !== 'active') throw invalidProposal(`node "${ref}" is inactive in ${where}`);
    return node;
  };

  const activeGroup = (ref: string | null, where: string): AiPlanNode | null => {
    if (ref === null) return null;
    const parent = activeNode(ref, where);
    if (parent.kind !== 'GROUP')
      throw invalidProposal(`parent "${ref}" is not a group in ${where}`);
    return parent;
  };

  const detach = (node: AiPlanNode): void => {
    const list = listOf(node.parentId);
    const index = list.indexOf(node.id);
    if (index >= 0) list.splice(index, 1);
    touchedParents.add(node.parentId);
  };

  operations.forEach((operation, index) => {
    const where = `operation #${index + 1}`;
    switch (operation.type) {
      case 'create': {
        if (state.has(operation.ref))
          throw invalidProposal(`duplicate reference "${operation.ref}"`);
        const parent = activeGroup(operation.parentRef, where);
        let code: string;
        if (operation.code) {
          code = operation.code;
          if (usedCodes.has(code.toLowerCase())) {
            throw invalidProposal(`code "${code}" already exists in ${where}`);
          }
        } else {
          const base = `${operation.kind === 'RESOURCE_TYPE' ? 'resource-type' : 'group'}-${slugify(operation.name)}`;
          code = base;
          for (let suffix = 2; usedCodes.has(code.toLowerCase()); suffix += 1) {
            code = `${base}-${suffix}`;
          }
        }
        usedCodes.add(code.toLowerCase());
        const node: AiPlanNode = {
          id: operation.ref,
          kind: operation.kind,
          code,
          name: operation.name,
          ...(operation.description ? { description: operation.description } : {}),
          status: 'active',
          parentId: parent?.id ?? null,
          sortOrder: 0,
          isNew: true,
          changes: new Set(['new']),
          createIndex: createdRefs.length,
        };
        state.set(node.id, node);
        createdRefs.push(node.id);
        listOf(node.parentId).push(node.id);
        touchedParents.add(node.parentId);
        break;
      }
      case 'rename': {
        const node = activeNode(operation.nodeRef, where);
        if (operation.name !== undefined && operation.name !== node.name) {
          node.name = operation.name;
          node.changes.add('renamed');
        }
        if (operation.description !== undefined) {
          const next = operation.description || undefined;
          if (next !== node.description) {
            if (next) node.description = next;
            else delete node.description;
            node.changes.add('renamed');
          }
        }
        break;
      }
      case 'move': {
        const node = activeNode(operation.nodeRef, where);
        const parent = activeGroup(operation.parentRef, where);
        const parentId = parent?.id ?? null;
        if (parentId === node.parentId) break;
        for (let cursor: AiPlanNode | undefined = parent ?? undefined; cursor;) {
          if (cursor.id === node.id) throw invalidProposal(`move creates a cycle in ${where}`);
          cursor = cursor.parentId ? state.get(cursor.parentId) : undefined;
        }
        detach(node);
        node.parentId = parentId;
        listOf(parentId).push(node.id);
        touchedParents.add(parentId);
        if (!node.isNew) node.changes.add('moved');
        break;
      }
      case 'reorder': {
        const parent = activeGroup(operation.parentRef, where);
        const parentId = parent?.id ?? null;
        const current = listOf(parentId);
        const requested = operation.orderedRefs;
        if (
          new Set(requested).size !== requested.length ||
          requested.length !== current.length ||
          !requested.every((ref) => current.includes(ref))
        ) {
          throw invalidProposal(`"orderedRefs" must list every child exactly once in ${where}`);
        }
        children.set(parentId, [...requested]);
        touchedParents.add(parentId);
        break;
      }
      case 'inactivate': {
        const node = activeNode(operation.nodeRef, where);
        if (node.isNew)
          throw invalidProposal(`cannot inactivate a node created in the same proposal`);
        detach(node);
        node.status = 'inactive';
        node.changes.add('inactivated');
        break;
      }
    }
  });

  // Nenhum nó ativo pode terminar sob um pai inativo (inativação é folhas-primeiro).
  for (const node of state.values()) {
    if (node.status !== 'active' || !node.parentId) continue;
    const parent = state.get(node.parentId);
    if (!parent || parent.status !== 'active') {
      throw invalidProposal(`node "${node.id}" would remain active under an inactivated group`);
    }
  }

  // Ordem final: reindexa somente os pais tocados; marca `reordered` quando a ordem relativa dos
  // irmãos que já existiam mudou.
  for (const parentId of touchedParents) {
    const list = listOf(parentId);
    const before = (originalParentOrder.get(String(parentId)) ?? []).filter((id) =>
      list.includes(id),
    );
    const after = list.filter((id) => before.includes(id));
    const relativeChanged = before.some((id, position) => after[position] !== id);
    list.forEach((id, position) => {
      const node = state.get(id)!;
      node.sortOrder = position;
      if (relativeChanged && !node.isNew && before.includes(id)) node.changes.add('reordered');
    });
  }

  const counters: ResourceCatalogAiCounters = {
    created: 0,
    renamed: 0,
    moved: 0,
    reordered: 0,
    inactivated: 0,
  };
  for (const node of state.values()) {
    if (node.changes.has('new')) counters.created += 1;
    if (node.changes.has('renamed')) counters.renamed += 1;
    if (node.changes.has('moved')) counters.moved += 1;
    if (node.changes.has('reordered')) counters.reordered += 1;
    if (node.changes.has('inactivated')) counters.inactivated += 1;
  }

  return { nodes: state, createdRefs, counters, projectedTree: projectTree(state, children) };
};

const projectTree = (
  state: Map<string, AiPlanNode>,
  children: Map<string | null, string[]>,
): ResourceCatalogAiProjectedNode[] => {
  const inactiveByParent = new Map<string | null, AiPlanNode[]>();
  for (const node of state.values()) {
    if (node.status !== 'inactive' || !node.changes.has('inactivated')) continue;
    const list = inactiveByParent.get(node.parentId) ?? [];
    list.push(node);
    inactiveByParent.set(node.parentId, list);
  }
  const build = (parentId: string | null): ResourceCatalogAiProjectedNode[] => {
    const active = (children.get(parentId) ?? []).map((id) => state.get(id)!);
    const retired = (inactiveByParent.get(parentId) ?? []).sort(
      (a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id),
    );
    return [...active, ...retired].map((node) => ({
      id: node.id,
      kind: node.kind,
      code: node.code,
      name: node.name,
      status: node.status,
      changes: [...node.changes],
      children: build(node.id),
    }));
  };
  return build(null);
};
