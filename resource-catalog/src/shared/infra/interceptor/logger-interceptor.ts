import { HttpService } from '@nestjs/axios';
import {
    CallHandler,
    ExecutionContext,
    HttpStatus,
    Injectable,
    NestInterceptor,
} from '@nestjs/common';
import * as fs from 'fs';
import * as https from 'https';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { LoggerService } from '@/shared/infra/logger/logger.service';
import { safeParse, safeStringify } from '@/shared/util/json.util';

import { EnvironmentConfigService } from '../config/env/environment-config.service';
import { Environment } from '../config/env/environment-config.validation';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
    private readonly secretManagerUrl: string;

    constructor(
        private readonly logger: LoggerService,
        private readonly httpService: HttpService,
        private readonly configService: EnvironmentConfigService,
    ) {
        this.secretManagerUrl = this.configService.get(
            'INTEGRATION_SECRET_MANAGER_URI',
        );

        this.httpService.axiosRef.interceptors.request.use(
            (config) => {
                this.logger.setContext(`${config.headers.contextDescription}`);
                config.headers['x-response-time'] = Date.now();

                let data: any;
                if (config.method === 'get') {
                    data = this.maskAdressUrl(config.url);
                } else {
                    data = this.maskBody(config.data, config.url);
                }
                this.logger.info(
                    {
                        type: 'request',
                        integration: true,
                        description: `INVOKE - REQUEST ENVIADO AO ${config.headers.contextDescription}`,
                        address: this.maskAdressUrl(config.url),
                        address_host: config.url && new URL(config.url).host,
                    },
                    data,
                );

                config.httpsAgent = new https.Agent({
                    rejectUnauthorized:
                        this.configService.get<Environment>('NODE_ENV') !==
                            Environment.Local &&
                        this.configService.get<boolean>(
                            'TLS_REJECT_UNAUTHORIZED',
                        ),
                    ca:
                        this.configService.get<Environment>('NODE_ENV') !==
                        Environment.Local
                            ? fs.readFileSync(
                                  '/etc/ssl/certs/ca-certificates.crt',
                              )
                            : undefined,
                });

                return config;
            },
            async (error) => {
                this.logger.error(
                    {
                        type: 'request',
                        integration: true,
                        description: `ERROR RECEBIDO DO ${error.config?.headers?.contextDescription}`,
                        address: this.maskAdressUrl(error.config?.url),
                        address_host:
                            error.config?.url && new URL(error.config.url).host,
                        status: error.response.status,
                        integration_response_time:
                            Date.now() -
                            error.config?.headers['x-response-time'],
                    },
                    this.maskBody(error.response?.data, error.config?.url) ||
                        error.message,
                );
                return Promise.reject(error);
            },
        );
        this.httpService.axiosRef.interceptors.response.use(
            (response) => {
                this.logger.info(
                    {
                        type: 'response',
                        integration: true,
                        description: `RESPONSE - RECEBIDO DO ${response.config.headers.contextDescription}`,

                        status: response.status,
                        address: this.maskAdressUrl(response.config.url),
                        address_host:
                            response.config.url &&
                            new URL(response.config.url).host,
                        integration_response_time:
                            Date.now() -
                            response.config.headers['x-response-time'],
                    },
                    this.maskBody(response.data, response.config.url),
                );
                return response;
            },
            async (error) => {
                this.logger.error(
                    {
                        type: 'response',
                        integration: true,
                        description: `ERROR RECEBIDO DO ${error.config?.headers?.contextDescription}`,
                        address: this.maskAdressUrl(error.config?.url),
                        address_host:
                            error.config?.url && new URL(error.config.url).host,
                        status: error.response?.status || 500,
                        integration_response_time:
                            Date.now() -
                            error.config?.headers?.['x-response-time'],
                    },
                    this.maskBody(error.response?.data, error.config?.url) ||
                        error.message,
                );
                return Promise.reject(error);
            },
        );
    }

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        if (context.getType() === 'rpc') {
            return this.interceptRpc(context, next);
        }
        return this.interceptHttp(context, next);
    }

    private interceptRpc(
        context: ExecutionContext,
        next: CallHandler,
    ): Observable<any> {
        this.logger.setContext('RPCLoggingInterceptor');

        const ctx = context.switchToRpc().getContext();
        const ctxMessage = ctx.getMessage();
        const content = ctxMessage.content.toString();
        const message = safeParse(content) || content;
        ctxMessage.properties ??= {};
        ctxMessage.properties.headers ??= {};
        const headers = ctxMessage.properties.headers;
        const retry = headers['x-retry-count'];

        this.logger.info(
            {
                description: `START - Inicialização do serviço${
                    retry ? ` > RETRY ${retry}` : ''
                }`,
            },
            safeStringify(message),
        );

        const startTime = Date.now();
        headers['startTime'] = startTime;
        headers['x-retry-count'] ??= 0;

        // RESPONSE LOG
        return next.handle().pipe(
            map((resData) => {
                this.logger.setContext('RPCLoggingInterceptor');

                const responseTime = Date.now() - startTime;
                const message = safeStringify(resData);
                const data = {
                    responseTime,
                    statusCode: resData ? HttpStatus.OK : HttpStatus.NO_CONTENT,
                    description: 'END - Finalização do serviço',
                };

                this.logger.info(data, message);

                return resData;
            }),
        );
    }

    private interceptHttp(
        context: ExecutionContext,
        next: CallHandler,
    ): Observable<any> {
        this.logger.setContext('LoggingInterceptor');

        const request = context.switchToHttp().getRequest();
        const { query, body, headers, url } = request;

        if (url === '/health') {
            // console.log(new Date(), 'Health check');
            return next.handle();
        }

        const msg =
            (Object.keys(body || {}).length && body) ||
            (Object.keys(query || {}).length && query);
        const message = safeParse(msg) || msg || '';

        this.logger.info(
            { description: 'START - Inicialização do serviço' },
            safeStringify(message),
        );

        const startTime = Date.now();
        headers.startTime = startTime;

        // RESPONSE LOG
        return next.handle().pipe(
            map((resData) => {
                const { statusCode } = context.switchToHttp().getResponse();
                const responseTime = Date.now() - startTime;
                const message = safeStringify(resData);
                const data = {
                    responseTime,
                    statusCode,
                    description: 'END - Finalização do serviço',
                };

                if (statusCode >= 400) {
                    this.logger.error(data, message);
                } else {
                    this.logger.info(data, message);
                }

                return resData;
            }),
        );
    }

    private maskBody(body: any, url: string | undefined) {
        if (!body) {
            return '';
        }

        body = safeStringify(body);

        if (this.secretManagerUrl && url?.includes(this.secretManagerUrl)) {
            return '*'.repeat(body.length);
        }

        return body;
    }

    private maskAdressUrl(url: string | undefined) {
        if (!url) {
            return 'N/A';
        }

        if (this.secretManagerUrl && url.includes(this.secretManagerUrl)) {
            return this.secretManagerUrl;
        }

        return url.replace(/(key=)([^&]+)/, '$1************');
    }
}
