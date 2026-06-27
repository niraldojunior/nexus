// import { TemplateType } from '@/module/template/domain/entity/template.entity';
// import { CacheMethod } from '@/shared/application/decorator/cache.decorator';
// import { TmfBaseRequestDto } from '@/shared/application/dto/tmf/tmf-base-request.dto';
// import { env } from '@/shared/infra/config/env/environment-config.service';

import { TemplateContentPort } from '../../../application/port/template-content/template-content.port';
import { CacheService } from '../../cache/cache-manager/cache.service';
import { HandlebarsService } from '../../service/handlebars/handlebars.service';

export interface TemplateTransform {
    query: string;
    headers: Record<string, string>;
    body: Record<string, any>;
    config: Record<string, any>;
}

export class TmfDtoTransformerProvider {
    constructor(
        private readonly handlebarsService: HandlebarsService,
        private readonly templateService: TemplateContentPort,
        private readonly cacheService: CacheService,
    ) {}

    // @CacheMethod(env<number>('TEMPLATE_TRANSFORM_CACHE_TTL'))
    // protected async getDtoRequest(
    // dto: TmfBaseRequestDto,
    // fallback = env<boolean>('TEMPLATE_FALLBACK_ENABLED'),
    // ): Promise<TemplateTransform> {
    // const key = {
    //     target: dto.provider,
    //     name: dto.templateName,
    //     version: dto.version,
    // type: TemplateType.REQUEST,
    // };

    //     const template = await this.templateService.getTemplate(key);
    //     if (template) this.handlebarsService.loadTemplate(key, template);

    //     const transform = this.handlebarsService.transform(
    //         {
    //             ...key,
    //             data: {
    //                 queryParams: dto.queryParams,
    //                 params: dto.params,
    //                 headers: dto.headers,
    //                 body: dto.body,
    //             },
    //         },
    //         fallback,
    //     );

    //     const urlParams = new URLSearchParams(transform.queryParams);

    //     const request = {
    //         query: urlParams.toString() ? `?${urlParams}` : '',
    //         headers: transform.headers || {},
    //         config: transform.config || {},
    //         body: transform.body || {},
    //     };

    //     if (request.config.path && request.config.path.startsWith('/')) {
    //         request.config.path = request.config.path.substring(1);
    //     }

    //     if (!request.config.path && fallback) {
    //         request.config.path = dto.path;
    //     }

    //     request.config.path = `/api/provider-federation-layer/${dto.provider}/${request.config.path || ''}`;

    //     return request;
    // }

    // @CacheMethod(env<number>('TEMPLATE_TRANSFORM_CACHE_TTL'))
    // protected async getDtoResponse(
    //     dto: TmfBaseRequestDto,
    //     fallback = env<boolean>('TEMPLATE_FALLBACK_ENABLED'),
    // ): Promise<TemplateTransform> {
    //     const key = {
    //         target: dto.provider,
    //         name: dto.templateName,
    //         version: dto.version,
    //         type: TemplateType.RESPONSE,
    //     };

    //     const template = await this.templateService.getTemplate(key);
    //     if (template) this.handlebarsService.loadTemplate(key, template);

    //     const transform = this.handlebarsService.transform(
    //         {
    //             ...key,
    //             data: {
    //                 queryParams: dto.queryParams,
    //                 params: dto.params,
    //                 headers: dto.headers,
    //                 body: dto.body,
    //             },
    //         },
    //         fallback,
    //     );

    //     const urlParams = new URLSearchParams(transform.queryParams);

    //     const response = {
    //         query: urlParams.toString() ? `?${urlParams}` : '',
    //         headers: transform.headers || {},
    //         config: transform.config || {},
    //         body: transform.body || {},
    //     };

    //     return response;
    // }
}
