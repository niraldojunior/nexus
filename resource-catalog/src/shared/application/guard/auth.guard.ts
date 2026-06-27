import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { FastifyRequest } from 'fastify';

import { ForbiddenRequestError } from '@/shared/application/error/forbiden-request.error';
import { EnvironmentConfigService } from '@/shared/infra/config/env/environment-config.service';
import { Environment } from '@/shared/infra/config/env/environment-config.validation';
import { LoggerService } from '@/shared/infra/logger/logger.service';
import { fnv1a } from '@/shared/util/hash.util';
import { safeStringify } from '@/shared/util/json.util';

import { REQUIRED_ROUTE_KEY } from '../../domain/decorator/role.decorator';
import { User, UserRole } from '../../domain/entity/user.entity';

@Injectable()
export class AuthGuard implements CanActivate {
    private logData = {
        context: this.constructor.name,
        description: this.constructor.name,
    };
    constructor(
        private readonly jwtService: JwtService,
        private readonly configService: EnvironmentConfigService,
        private readonly reflector: Reflector,
        private readonly logger: LoggerService,
    ) {}

    canActivate(context: ExecutionContext): boolean {
        this.logger.setContext(AuthGuard.name);
        const request = context.switchToHttp().getRequest();
        const token = this.extractToken(request);

        if (!token) {
            const companyId = request.headers['companyid'] || '';
            const clientId = request.headers['clientid'] || '';

            // Assume request if coming from API Gateway and create a "user" based on companyId and clientId
            // Adjust permissions as needed
            if (companyId || clientId) {
                const user = new User({
                    id: `${companyId}:${clientId}`,
                    email: [],
                    name: `${companyId}:${clientId}`,
                    role: [UserRole.PRODUTOS_USER],
                    sub: fnv1a(`${companyId}:${clientId}`),
                });

                request['user'] = user;
                request.headers['x-user'] = user.getId();

                this.logger.warn(
                    this.logData,
                    safeStringify({
                        message:
                            'No token provided, but allowing access based on companyId and clientId',
                        companyId,
                        clientId,
                        user,
                    }),
                );

                return true;
            }

            if (
                !this.configService.get<boolean>('PORTAL_BACKEND_GUARD_ENABLED')
            ) {
                this.logger.warn(
                    this.logData,
                    'No token provided, but allowing access because guard is disabled',
                );
                return true;
            }

            if (
                this.configService.get<Environment>('NODE_ENV') ===
                Environment.Local
            ) {
                this.logger.warn(
                    this.logData,
                    'No token provided, but allowing access in local environment',
                );
                return true;
            }

            throw new UnauthorizedException();
        }

        try {
            const payload: User = new User(
                this.jwtService.verify(token, {
                    secret: this.configService.get<string>(
                        'PORTAL_BACKEND_GUARD_JWT',
                    ),
                }),
            );
            // 💡 We're assigning the payload to the request object here
            // so that we can access it in our route handlers
            request['user'] = payload;
            request.headers['x-user'] = payload.getId();
        } catch (err: any) {
            if (err instanceof ForbiddenRequestError) {
                this.logger.error(
                    this.logData,
                    safeStringify({
                        message: 'User does not have required role',
                        error: err.message,
                        stack: err.stack,
                    }),
                );
                throw new ForbiddenException();
            }
            this.logger.error(
                {
                    context: this.constructor.name,
                    description: this.constructor.name,
                },
                safeStringify({
                    message: err.message,
                    cause: err.cause,
                    description: err.description,
                    stack: err.stack,
                }),
            );
            throw new UnauthorizedException();
        }

        const requiredRole = this.reflector.getAllAndOverride<UserRole[]>(
            REQUIRED_ROUTE_KEY,
            [context.getHandler(), context.getClass()],
        );
        if (requiredRole) {
            const user: User = request['user'];
            if (!user.validateRole(requiredRole)) {
                this.logger.error(
                    this.logData,
                    safeStringify({
                        message: 'User does not have required role',
                        requiredRole,
                        user: { ...user, name: undefined, email: undefined },
                    }),
                );
                throw new ForbiddenException();
            }
        }

        return true;
    }

    private extractToken(request: FastifyRequest): string | undefined {
        const [_, token] =
            request.headers.cookie?.split('X-Authorization=') ?? [];
        return token ?? undefined;
    }
}
