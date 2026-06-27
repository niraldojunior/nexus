import { env } from '../env/environment-config.service';
import { SwaggerConfig } from './swagger.interface';

// No need to edit this, it will load the correct variables in OpenShift
export const SWAGGER_CONFIG: SwaggerConfig = {
    title: env('APP_NAME', 'Microservice Template'),
    description: env('SWAGGER_DESCRIPTION', 'API documentation'),
    version: env('DD_VERSION', '1.0.0'),
    apiServer: env<string[]>('SWAGGER_API_SERVER'),
};
