/* eslint-disable no-console */
import { fastifyHelmet as helmet } from '@fastify/helmet';
import {
    INestApplication,
    RequestMethod,
    ValidationPipe,
    VersioningType,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
    FastifyAdapter,
    NestFastifyApplication,
} from '@nestjs/platform-fastify';
// import { RmqOptions } from '@nestjs/microservices';
import { SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';

import { VALIDATION_PIPE_OPTIONS } from '@/shared/application/const/config.constant';
import { env } from '@/shared/infra/config/env/environment-config.service';
import { createDocument } from '@/shared/infra/config/swagger/swagger';
// import { RmqModule } from '@/shared/infra/message-broker/rmq/rmq.module';
import { getCorsOrigins } from '@/shared/util/cors.util';

import { UtilsAppModule } from './app.module';

let app: INestApplication;

async function bootstrap() {
    const APP_ROUTE_PREFIX = env('API_ROUTE_PREFIX', '');

    app = await NestFactory.create<NestFastifyApplication>(
        UtilsAppModule,
        new FastifyAdapter({
            logger: env<boolean>('DEBUG'),
            bodyLimit: 10485760, // 10 MB,
        }),
    );

    app.useGlobalPipes(new ValidationPipe(VALIDATION_PIPE_OPTIONS));

    app.setGlobalPrefix(APP_ROUTE_PREFIX, {
        exclude: [
            { path: 'swagger', method: RequestMethod.ALL },
            { path: 'health', method: RequestMethod.GET },
        ],
    });
    app.enableVersioning({
        type: VersioningType.URI,
        prefix: 'v',
        defaultVersion: '1',
    });

    /**
     * Logs
     */
    app.useLogger(app.get(Logger));

    /**
     * Segurança
     */
    app.enableCors({
        origin: getCorsOrigins(),
        methods: ['OPTIONS', 'POST'],
    });
    app.getHttpAdapter()
        .getInstance()
        .addHook('onSend', (_request, reply, _payload, done) => {
            reply.header('x-powered-by', '');
            reply.header('e-tag', '');
            done();
        })
        .register(helmet, {
            hidePoweredBy: true,
            originAgentCluster: true,
            xContentTypeOptions: true,
            xDownloadOptions: true,
            xDnsPrefetchControl: { allow: true },
            xFrameOptions: { action: 'sameorigin' },
            referrerPolicy: { policy: 'same-origin' },
            crossOriginOpenerPolicy: { policy: 'same-origin' },
            crossOriginEmbedderPolicy: { policy: 'require-corp' },
            xPermittedCrossDomainPolicies: { permittedPolicies: 'none' },
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    scriptSrc: ["'self'", "'unsafe-inline'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    imgSrc: ["'self'", 'data:'],
                    fontSrc: ["'self'"],
                },
            },
        });

    if (env('NODE_ENV') !== 'production' || env<boolean>('SWAGGER_ENABLED')) {
        SwaggerModule.setup('swagger', app, createDocument(app), {
            swaggerOptions: {
                supportedSubmitMethods: env<string[] | undefined>(
                    'SWAGGER_ALLOWED_METHODS',
                ),
            },
        });
    }

    /**
     * Microservices
     */
    // const connections = app.get<RmqModule>(RmqModule).getConnections();
    // connections.forEach((connection: RmqOptions) => {
    //     console.log('Connecting to RMQ:', {
    //         host: connection.options?.urls,
    //         queue: connection.options?.queue,
    //     });
    //     app.connectMicroservice(connection, { inheritAppConfig: true });
    // });
    // await app.startAllMicroservices().then(() => {
    //     console.log('Microservices is running...');
    // });

    /**
     * HTTP
     */
    await app.listen(env<number>('PORT', 3000), '0.0.0.0').then(() => {
        console.log(`Initializing at port ${env<number>('PORT', 3000)}...`);
    });
}
bootstrap()
    .then(() => {
        const swaggerRoute = env('API_ROUTE_PREFIX')
            ? `/${env('API_ROUTE_PREFIX')}/swagger`
            : '/swagger';
        console.log('Server is running...');
        console.log(`Name: ${env('APP_NAME')}`);
        console.log(`Version: ${env('DD_VERSION')}`);
        console.log(`Environment: ${env('NODE_ENV')}`);
        if (env<boolean>('SWAGGER_ENABLED'))
            console.log(`Swagger: ${env('APP_HOST')}${swaggerRoute}`);
        console.info(`Health Check: ${env('APP_HOST')}/health`);
    })
    .catch((error) => {
        console.log(error);
        throw error;
    });

export const getAppInstance = (): INestApplication => {
    return app;
};
