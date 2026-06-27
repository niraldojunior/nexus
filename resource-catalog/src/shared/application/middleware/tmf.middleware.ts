import { Injectable, NestMiddleware } from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { ClsService } from 'nestjs-cls';

import { safeStringify } from '@/shared/util/json.util';

@Injectable()
export class TmfMiddleware implements NestMiddleware {
    constructor(private readonly cls: ClsService) {}
    use(
        req: FastifyRequest['raw'],
        _res: FastifyReply['raw'],
        next: () => void,
    ): void {
        // Params, query and body are not accessible here using Fastify
        // https://stackoverflow.com/questions/69358567/unable-to-get-request-body-via-nestjs-middleware-having-application-with-fastify

        // Instead, we should use onRequest hook to attach the missing data on req.raw;
        // use interceptors or guards; or try a completely different approach.

        // For this project, we are using a base dto for all requests, so it's simpler to
        // just receive the request data on controllers and set them on the constructor there.

        this.cls.set('provider', safeStringify(req.headers['provider']));
        // this.cls.set('params', safeStringify(req.params));
        // this.cls.set('queryParams', safeStringify(req.query));
        this.cls.set(
            'headers',
            safeStringify(
                req.headers ? { ...req.headers, host: undefined } : {},
            ),
        );
        // this.cls.set('body', safeStringify(req.body));
        next();
    }
}
