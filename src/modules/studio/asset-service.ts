import { createHash } from 'node:crypto';
import { AppError } from '../../shared/errors/app-error.js';
import type { RequestContext } from '../../shared/http/request-context.js';
import { createCanonicalId } from '../../shared/utils/canonical-id.js';
import type { IStudioAssetRepository } from './asset-repository-interface.js';

export const STUDIO_ASSET_MIME_TYPE = 'image/svg+xml' as const;
export const STUDIO_SVG_MAX_BYTES = 100_000;

export type StudioAsset = {
  '@type': 'StudioAsset';
  id: string;
  tenantId: string;
  name: string;
  mimeType: typeof STUDIO_ASSET_MIME_TYPE;
  content: string;
  checksum: string;
  active: boolean;
  createdAt: string;
  createdBy: string;
  retiredAt?: string;
  retiredBy?: string;
};

const FORBIDDEN_SVG_TAGS = /<\/?(?:script|foreignObject|iframe|object|embed|link|style|animate|set|audio|video)\b[^>]*>/i;
const EVENT_HANDLER_ATTRIBUTE = /\son[a-z]+\s*=/i;
const EXTERNAL_REFERENCE = /\b(?:href|xlink:href|src)\s*=\s*["']\s*(?:(?:https?:)?\/\/|data:|javascript:|vbscript:|file:)/i;
const CSS_REFERENCE = /(?:@import|url\s*\()/i;

const tenantOf = (context: Pick<RequestContext, 'tenantId'>): string => context.tenantId;

/**
 * Validates deliberately small, self-contained SVG documents. The renderer never accepts data URLs
 * or arbitrary HTML; after these checks, the original SVG text is preserved so its checksum remains
 * stable between validation, persistence and serving.
 */
export const sanitizeStudioSvg = (value: unknown): string => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new AppError('SVG content is required', { code: 'STUDIO_ASSET_SVG_REQUIRED', statusCode: 400 });
  }
  const content = value.trim();
  if (Buffer.byteLength(content, 'utf8') > STUDIO_SVG_MAX_BYTES) {
    throw new AppError('SVG content exceeds the allowed size', {
      code: 'STUDIO_ASSET_SVG_TOO_LARGE',
      statusCode: 413,
    });
  }
  if (!/^<svg\b[^>]*>/i.test(content) || !/<\/svg>\s*$/i.test(content)) {
    throw new AppError('asset must be a standalone SVG document', {
      code: 'STUDIO_ASSET_SVG_INVALID',
      statusCode: 400,
    });
  }
  if (
    FORBIDDEN_SVG_TAGS.test(content) ||
    EVENT_HANDLER_ATTRIBUTE.test(content) ||
    EXTERNAL_REFERENCE.test(content) ||
    CSS_REFERENCE.test(content)
  ) {
    throw new AppError('SVG contains prohibited active or external content', {
      code: 'STUDIO_ASSET_SVG_UNSAFE',
      statusCode: 422,
    });
  }
  return content;
};

export class StudioAssetService {
  constructor(private readonly repository: IStudioAssetRepository) {}

  public async create(
    input: { name?: unknown; mimeType?: unknown; content?: unknown },
    context: RequestContext,
  ): Promise<StudioAsset> {
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name) {
      throw new AppError('asset name is required', { code: 'STUDIO_ASSET_NAME_REQUIRED', statusCode: 400 });
    }
    if (input.mimeType !== STUDIO_ASSET_MIME_TYPE) {
      throw new AppError('only SVG assets are supported', {
        code: 'STUDIO_ASSET_MIME_UNSUPPORTED',
        statusCode: 415,
      });
    }
    const content = sanitizeStudioSvg(input.content);
    const now = new Date().toISOString();
    const asset: StudioAsset = {
      '@type': 'StudioAsset',
      id: createCanonicalId(),
      tenantId: tenantOf(context),
      name,
      mimeType: STUDIO_ASSET_MIME_TYPE,
      content,
      checksum: createHash('sha256').update(content).digest('hex'),
      active: true,
      createdAt: now,
      createdBy: context.actorSub,
    };
    return await this.repository.insert(asset);
  }

  public async get(id: string, context: Pick<RequestContext, 'tenantId'>): Promise<StudioAsset | undefined> {
    return await this.repository.get(tenantOf(context), id);
  }

  public async list(context: Pick<RequestContext, 'tenantId'>, active = true): Promise<StudioAsset[]> {
    return await this.repository.list(tenantOf(context), { active });
  }

  public async retire(id: string, context: RequestContext): Promise<StudioAsset> {
    const asset = await this.repository.retire(tenantOf(context), id, new Date().toISOString(), context.actorSub);
    if (!asset) {
      throw new AppError('studio asset not found', { code: 'STUDIO_ASSET_NOT_FOUND', statusCode: 404 });
    }
    return asset;
  }
}
