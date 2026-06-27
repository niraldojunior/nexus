import { env } from '@/shared/infra/config/env/environment-config.service';

export const getCorsOrigins = (): boolean | string | string[] => {
    const nodeEnv = env('NODE_ENV', 'development');
    if (['development', 'local', 'test'].includes(nodeEnv)) {
        return true;
    }

    const origins = env('CORS_ALLOWED_ORIGINS');
    if (!origins) {
        return true;
    }

    const originsList = origins.split(',');
    if (originsList.length === 1) {
        return origins;
    }

    return originsList;
};
