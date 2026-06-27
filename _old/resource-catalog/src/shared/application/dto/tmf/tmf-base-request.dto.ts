import { BadRequestException } from '@nestjs/common';
import { AxiosResponse } from '@nestjs/terminus/dist/health-indicator/http/axios.interfaces';
import { FastifyRequest } from 'fastify';

// import { TemplateNames } from '@/module/template/domain/entity/template-name.entity';
import {
    Route,
    RouteConfig,
    // Routes,
} from '@/shared/application/const/route.const';

export class TmfBaseRequestDto {
    queryParams: Record<string, string>;
    params: Record<string, string>;
    headers: Record<string, string>;
    body: Record<string, any>;

    provider: string;
    templateName: string;
    path: string;
    version: string;

    setup(
        req: FastifyRequest,
        route: Route,
        path: RouteConfig,
        version: string,
    ): void {
        this.path = `${route.root}/${path.route}`;
        this.provider = req.headers['x-network-provider'] as string;
        this.queryParams = req.query as Record<string, string>;
        this.params = req.params as Record<string, string>;
        this.headers = Object.entries(req.headers).reduce(
            (acc, [key, value]) => {
                const blacklist = [
                    'host',
                    'connection',
                    'user-agent',
                    'accept',
                    'referer',
                    'accept-encoding',
                    'accept-language',
                    'cookie',
                    'content-length',
                    'starttime',
                ];
                if (!(key && value)) {
                    return acc;
                }
                if (blacklist.includes(key.toLowerCase())) {
                    return acc;
                }
                if (key.startsWith('sec-')) {
                    return acc;
                }
                acc[key] = value as string;
                return acc;
            },
            {},
        );
        this.body = (req.body as Record<string, any>) || {};

        // this.templateName =
        //     new TemplateNames(Routes.tmf).getName({
        //         root: route.root,
        //         tag: route.tag,
        //         path: path.route,
        //         version: version,
        //         description: path.summary,
        //     }) || '';

        this.version = version;

        if (!this.provider) {
            throw new BadRequestException('provider is required');
        }
        if (!this.templateName) {
            throw new BadRequestException('path is required');
        }
        if (!this.version) {
            throw new BadRequestException('version is required');
        }
    }

    mapResponse(response: AxiosResponse): TmfBaseRequestDto {
        const headers = Object.entries(response.headers).reduce(
            (acc, [key, value]) => {
                const blacklist = [
                    'vary',
                    'set-cookie',
                    'transfer-encoding',
                    'content-length',
                    'connection',
                    'keep-alive',
                    'content-encoding',
                    'content-type',
                    'date',
                    'x-content-type-options',
                    'x-xss-protection',
                    'cache-control',
                    'pragma',
                    'expires',
                    'content-security-policy',
                    'strict-transport-security',
                    'referrer-policy',
                    'x-frame-options',
                    'server',
                    'alt-svc',
                    'accept-ranges',
                    'etag',
                    'last-modified',
                    'x-cache',
                    'x-cache-hits',
                    'x-served-by',
                    'x-timer',
                    'cf-ray',
                    'cf-cache-status',
                    'expect-ct',
                    'nel',
                    'report-to',
                    'x-powered-by',
                ];
                if (!(key && value)) {
                    return acc;
                }
                if (blacklist.includes(key.toLowerCase())) {
                    return acc;
                }
                acc[key] = value as string;
                return acc;
            },
            {},
        );
        return { ...this, ...response, headers };
    }
}
