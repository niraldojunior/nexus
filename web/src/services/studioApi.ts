import { bearerToken } from './session';

const API_BASE_URL = '/v1/studio';

export type StudioDomain =
  | 'resource-model'
  | 'location-model'
  | 'spatial'
  | 'studio-geo'
  | 'parties'
  | 'reference-data'
  | 'rules-workflows'
  | 'templates';

export type StudioVersionStatus = 'draft' | 'published' | 'discarded';
export type StudioValidationSeverity = 'error' | 'warning';

export type StudioValidationIssue = {
  severity: StudioValidationSeverity;
  code: string;
  message: string;
  path?: string;
};

export type StudioValidationResult = {
  valid: boolean;
  issues: StudioValidationIssue[];
  validatedAt: string;
};

export type StudioVersion = {
  '@type': 'StudioVersion';
  id: string;
  href: string;
  tenantId: string;
  domain: StudioDomain;
  versionNumber: number;
  status: StudioVersionStatus;
  snapshot: Record<string, unknown>;
  checksum: string;
  validation?: StudioValidationResult;
  baseVersionId?: string;
  createdAt: string;
  createdBy: string;
  publishedAt?: string;
  publishedBy?: string;
  discardedAt?: string;
  discardedBy?: string;
};

export type StudioWorkspace = {
  '@type': 'StudioWorkspace';
  id: string;
  href: string;
  tenantId: string;
  domain: StudioDomain;
  publishedVersionId?: string;
  draftVersionId?: string;
  updatedAt: string;
};

export type StudioStatus = {
  workspace: StudioWorkspace;
  publishedVersion?: StudioVersion;
  draftVersion?: StudioVersion;
};

export type StudioAuditEntry = {
  '@type': 'StudioAuditEntry';
  id: string;
  tenantId: string;
  domain: StudioDomain;
  action: 'draft-created' | 'draft-updated' | 'draft-validated' | 'published' | 'discarded';
  versionId: string;
  versionNumber: number;
  actorSub: string;
  eventTime: string;
};

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT';
  body?: unknown;
  ifMatch?: string;
};

const authHeaders = (ifMatch?: string): HeadersInit => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${bearerToken()}`,
  ...(ifMatch ? { 'If-Match': ifMatch } : {}),
});

async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
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

export const getStudioStatus = async (domain: StudioDomain): Promise<StudioStatus> =>
  await requestJson<StudioStatus>(`/${domain}/status`);

export const listStudioVersions = async (
  domain: StudioDomain,
  query: { limit?: number; offset?: number } = {},
): Promise<StudioVersion[]> => {
  const params = new URLSearchParams();
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  if (query.offset !== undefined) params.set('offset', String(query.offset));
  const suffix = params.size > 0 ? `?${params.toString()}` : '';
  return await requestJson<StudioVersion[]>(`/${domain}/versions${suffix}`);
};

export const listStudioAudit = async (
  domain: StudioDomain,
  query: { limit?: number; offset?: number } = {},
): Promise<StudioAuditEntry[]> => {
  const params = new URLSearchParams();
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  if (query.offset !== undefined) params.set('offset', String(query.offset));
  const suffix = params.size > 0 ? `?${params.toString()}` : '';
  return await requestJson<StudioAuditEntry[]>(`/${domain}/audit${suffix}`);
};

export const saveStudioDraft = async (
  domain: StudioDomain,
  snapshot: Record<string, unknown>,
  ifMatch?: string,
): Promise<StudioVersion> =>
  await requestJson<StudioVersion>(`/${domain}/draft`, {
    method: 'PUT',
    body: { snapshot },
    ...(ifMatch ? { ifMatch } : {}),
  });

export const validateStudioDraft = async (domain: StudioDomain): Promise<StudioValidationResult> =>
  await requestJson<StudioValidationResult>(`/${domain}/validate`, { method: 'POST' });

export const publishStudioDraft = async (
  domain: StudioDomain,
  ifMatch: string,
): Promise<StudioVersion> =>
  await requestJson<StudioVersion>(`/${domain}/publish`, { method: 'POST', ifMatch });

export const discardStudioDraft = async (
  domain: StudioDomain,
  ifMatch: string,
): Promise<StudioVersion> =>
  await requestJson<StudioVersion>(`/${domain}/discard`, { method: 'POST', ifMatch });
