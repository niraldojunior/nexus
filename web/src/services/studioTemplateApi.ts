import { bearerToken } from './session';
import type { StudioDomain, StudioVersion } from './studioApi';

export type ConflictStrategy = 'reject' | 'reuse' | 'rename';

export type StudioTemplateFragment = {
  domain: StudioDomain;
  payload: Record<string, unknown>;
};

export type StudioTemplateItem = {
  id?: string;
  code: string;
  name: string;
  description?: string;
  category: string;
  version: string;
  author?: string;
  dependencies?: string[];
  fragments: StudioTemplateFragment[];
  metadata?: Record<string, unknown>;
};

export type TemplatesStudioSnapshot = {
  templates: StudioTemplateItem[];
};

export type TemplateImportConflict = {
  id: string;
  domain: StudioDomain;
  kind: string;
  code: string;
  name: string;
  existingName?: string;
  resolution: ConflictStrategy;
  suggestedName?: string;
  suggestedCode?: string;
};

export type TemplateImportOperation = {
  domain: StudioDomain;
  action: 'create' | 'reuse' | 'rename' | 'skip';
  entityType: string;
  code: string;
  originalCode: string;
  name: string;
  details?: string;
};

export type StudioTemplateImportPlan = {
  templateCode: string;
  templateVersion: string;
  planChecksum: string;
  conflicts: TemplateImportConflict[];
  operations: TemplateImportOperation[];
  resultSnapshots: Record<StudioDomain, Record<string, unknown>>;
  canApply: boolean;
};

export type ComputePlanInput = {
  template: StudioTemplateItem;
  targets: StudioDomain[];
  baseSnapshots: Partial<Record<StudioDomain, Record<string, unknown>>>;
  conflictResolutions?: Record<string, ConflictStrategy>;
  renameOverrides?: Record<string, { code?: string; name?: string }>;
};

export type ApplyTemplatePlanInput = {
  planInput: ComputePlanInput;
  planChecksum: string;
  targetDrafts?: Partial<Record<StudioDomain, { ifMatch?: string }>>;
};

export type ApplyTemplatePlanResponse = {
  applied: boolean;
  planChecksum: string;
  versions: Record<StudioDomain, StudioVersion>;
};

const authHeaders = (ifMatch?: string): HeadersInit => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${bearerToken()}`,
  ...(ifMatch ? { 'If-Match': ifMatch } : {}),
});

async function requestJson<T>(url: string, options: { method?: string; body?: unknown; ifMatch?: string } = {}): Promise<T> {
  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers: authHeaders(options.ifMatch),
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
  const text = await response.text();
  const payload = text ? (JSON.parse(text) as T) : (undefined as T);
  if (!response.ok) {
    const record = payload as Record<string, unknown> | undefined;
    const message =
      (typeof record?.message === 'string' ? record.message : undefined) ??
      (typeof record?.error === 'string' ? record.error : undefined) ??
      `Falha na requisição (${response.status})`;
    throw new Error(message);
  }
  return payload;
}

export const computeTemplateImportPlan = async (
  input: ComputePlanInput,
): Promise<StudioTemplateImportPlan> => {
  return await requestJson<StudioTemplateImportPlan>('/v1/studio/templates/plan', {
    method: 'POST',
    body: input,
  });
};

export const applyTemplateImportPlan = async (
  input: ApplyTemplatePlanInput,
): Promise<ApplyTemplatePlanResponse> => {
  return await requestJson<ApplyTemplatePlanResponse>('/v1/studio/templates/apply', {
    method: 'POST',
    body: input,
  });
};
