import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

import { SWAGGER_CONFIG } from './swagger.config';

/**
 * Creates an OpenAPI document for an application, via swagger.
 * @param app the nestjs application
 * @returns the OpenAPI document
 */
export function createDocument(app: INestApplication): OpenAPIObject {
    const builder = new DocumentBuilder()
        .setTitle(SWAGGER_CONFIG.title)
        .setDescription(SWAGGER_CONFIG.description)
        .setVersion(SWAGGER_CONFIG.version || '1.0.0');

    if (SWAGGER_CONFIG.apiServer?.length) {
        SWAGGER_CONFIG.apiServer.forEach((server) => {
            builder.addServer(server);
        });
    }

    const options = builder.build();

    return SwaggerModule.createDocument(app, options);
}
