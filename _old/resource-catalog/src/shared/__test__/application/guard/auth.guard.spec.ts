import { ForbiddenException, UnauthorizedException } from '@nestjs/common';

import { ForbiddenRequestError } from '@/shared/application/error/forbiden-request.error';
import { AuthGuard } from '@/shared/application/guard/auth.guard';
import { UserRole } from '@/shared/domain/entity/user.entity';

const makeJwtServiceMock = () => ({ verify: jest.fn() });
const makeConfigServiceMock = () => ({ get: jest.fn() });
const makeReflectorMock = () => ({ getAllAndOverride: jest.fn() });
const makeLoggerMock = () => ({
    setContext: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
});

function makeCtx(requestOverrides: Record<string, any> = {}) {
    const request: Record<string, any> = {
        headers: {},
        ...requestOverrides,
    };
    return {
        switchToHttp: () => ({
            getRequest: () => request,
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
    } as any;
}

describe('AuthGuard', () => {
    let jwt: ReturnType<typeof makeJwtServiceMock>;
    let config: ReturnType<typeof makeConfigServiceMock>;
    let reflector: ReturnType<typeof makeReflectorMock>;
    let logger: ReturnType<typeof makeLoggerMock>;
    let guard: AuthGuard;

    beforeEach(() => {
        jwt = makeJwtServiceMock();
        config = makeConfigServiceMock();
        reflector = makeReflectorMock();
        logger = makeLoggerMock();
        guard = new AuthGuard(
            jwt as any,
            config as any,
            reflector as any,
            logger as any,
        );
    });

    it('should allow access when guard is disabled and no token', () => {
        config.get.mockImplementation((key: string) => {
            if (key === 'PORTAL_BACKEND_GUARD_ENABLED') return false;
            return undefined;
        });
        reflector.getAllAndOverride.mockReturnValue(undefined);

        const ctx = makeCtx();
        const result = guard.canActivate(ctx);

        expect(result).toBe(true);
    });

    it('should allow access in local environment when no token', () => {
        config.get.mockImplementation((key: string) => {
            if (key === 'PORTAL_BACKEND_GUARD_ENABLED') return true;
            if (key === 'NODE_ENV') return 'local';
            return undefined;
        });
        reflector.getAllAndOverride.mockReturnValue(undefined);

        const ctx = makeCtx();
        const result = guard.canActivate(ctx);

        expect(result).toBe(true);
    });

    it('should throw UnauthorizedException when no token and guard is enabled in prod', () => {
        config.get.mockImplementation((key: string) => {
            if (key === 'PORTAL_BACKEND_GUARD_ENABLED') return true;
            if (key === 'NODE_ENV') return 'production';
            return undefined;
        });

        const ctx = makeCtx();

        expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
    });

    it('should create a user from companyId and clientId when no token', () => {
        config.get.mockReturnValue(undefined);
        reflector.getAllAndOverride.mockReturnValue(undefined);

        const ctx = makeCtx({
            headers: { companyid: 'COMP01', clientid: 'CLIENT01' },
        });

        const result = guard.canActivate(ctx);

        expect(result).toBe(true);
        const request = ctx.switchToHttp().getRequest();
        expect(request['user']).toBeDefined();
        expect(request.headers['x-user']).toBeDefined();
    });

    it('should allow access when JWT is valid and no required role', () => {
        const payload = {
            sub: 'abc',
            id: 'user-1',
            name: 'Alice',
            email: ['alice@example.com'],
            role: [UserRole.PRODUTOS_USER],
        };
        jwt.verify.mockReturnValue(payload);
        config.get.mockReturnValue('secret');
        reflector.getAllAndOverride.mockReturnValue(undefined);

        const ctx = makeCtx({
            headers: { cookie: 'X-Authorization=valid-token' },
        });

        const result = guard.canActivate(ctx);

        expect(result).toBe(true);
        expect(jwt.verify).toHaveBeenCalledWith('valid-token', {
            secret: 'secret',
        });
    });

    it('should allow access when JWT is valid and user has required role', () => {
        const payload = {
            sub: 'abc',
            id: 'user-1',
            name: 'Alice',
            email: [],
            role: [UserRole.ADMIN],
        };
        jwt.verify.mockReturnValue(payload);
        config.get.mockReturnValue('secret');
        reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);

        const ctx = makeCtx({
            headers: { cookie: 'X-Authorization=valid-token' },
        });

        const result = guard.canActivate(ctx);

        expect(result).toBe(true);
    });

    it('should throw ForbiddenException when user does not have required role', () => {
        const payload = {
            sub: 'abc',
            id: 'user-1',
            name: 'Alice',
            email: [],
            role: [UserRole.PRODUTOS_USER],
        };
        jwt.verify.mockReturnValue(payload);
        config.get.mockReturnValue('secret');
        reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);

        const ctx = makeCtx({
            headers: { cookie: 'X-Authorization=valid-token' },
        });

        expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when JWT verify throws ForbiddenRequestError', () => {
        jwt.verify.mockImplementation(() => {
            throw new ForbiddenRequestError('bad role');
        });
        config.get.mockReturnValue('secret');

        const ctx = makeCtx({
            headers: { cookie: 'X-Authorization=bad-token' },
        });

        expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('should throw UnauthorizedException when JWT verify throws a generic error', () => {
        jwt.verify.mockImplementation(() => {
            throw new Error('invalid token');
        });
        config.get.mockReturnValue('secret');

        const ctx = makeCtx({
            headers: { cookie: 'X-Authorization=bad-token' },
        });

        expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
    });
});
