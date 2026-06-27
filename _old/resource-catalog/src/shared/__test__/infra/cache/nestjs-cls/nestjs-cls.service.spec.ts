import { ContextMethod } from '@/shared/application/const/context-method.constant';
import { UNKNOWN_EVENT_PATTERN } from '@/shared/application/const/message-broker-unknown-event-pattern.const';
import { ClsService } from '@/shared/infra/cache/nestjs-cls/nestjs-cls.service';

describe('NestJsClsService', () => {
    let mockCls: { set: jest.Mock };
    let mockCtx: any;

    beforeEach(() => {
        mockCls = { set: jest.fn() };
        jest.clearAllMocks();
    });

    describe('setupInterceptor', () => {
        it('should set service and operation for rpc context with known pattern', () => {
            mockCtx = {
                getType: jest.fn().mockReturnValue('rpc'),
                switchToRpc: jest.fn().mockReturnThis(),
                getContext: jest.fn().mockReturnValue({
                    getMessage: () => ({
                        fields: { routingKey: 'queue.name' },
                    }),
                    getPattern: () => 'some.pattern',
                }),
            };

            // Add a mapping to ContextMethod for this test
            (ContextMethod as any)['some.pattern'] = {
                service: 'TestService',
                operation: 'TestOp',
            };

            ClsService.setupInterceptor(mockCls as any, mockCtx);

            expect(mockCls.set).toHaveBeenCalledWith(
                'service',
                expect.stringContaining('TestService'),
            );
            expect(mockCls.set).toHaveBeenCalledWith('operation', 'TestOp');
        });

        it('should set service and operation for rpc context with unknown pattern', () => {
            mockCtx = {
                getType: jest.fn().mockReturnValue('rpc'),
                switchToRpc: jest.fn().mockReturnThis(),
                getContext: jest.fn().mockReturnValue({
                    getMessage: () => ({
                        fields: { routingKey: 'queue.name' },
                    }),
                    getPattern: () => UNKNOWN_EVENT_PATTERN,
                }),
            };

            ClsService.setupInterceptor(mockCls as any, mockCtx);

            expect(mockCls.set).toHaveBeenCalledWith(
                'service',
                expect.stringContaining(`${UNKNOWN_EVENT_PATTERN}`),
            );
            expect(mockCls.set).toHaveBeenCalledWith(
                'operation',
                UNKNOWN_EVENT_PATTERN.split('.').pop(),
            );
        });

        it('should set service and operation for http context with known mapping', () => {
            mockCtx = {
                getType: jest.fn().mockReturnValue('http'),
                getClass: jest.fn().mockReturnValue({ name: 'TestController' }),
                getHandler: jest.fn().mockReturnValue({ name: 'testMethod' }),
            };

            // Add a mapping to ContextMethod for this test
            (ContextMethod as any)['TestController.testMethod'] = {
                service: 'HttpService',
                operation: 'HttpOp',
            };

            ClsService.setupInterceptor(mockCls as any, mockCtx);

            expect(mockCls.set).toHaveBeenCalledWith(
                'service',
                expect.stringContaining('HttpService'),
            );
            expect(mockCls.set).toHaveBeenCalledWith('operation', 'HttpOp');
        });

        it('should set service and operation for http context with fallback', () => {
            mockCtx = {
                getType: jest.fn().mockReturnValue('http'),
                getClass: jest
                    .fn()
                    .mockReturnValue({ name: 'FallbackController' }),
                getHandler: jest
                    .fn()
                    .mockReturnValue({ name: 'fallbackMethod' }),
            };

            ClsService.setupInterceptor(mockCls as any, mockCtx);

            expect(mockCls.set).toHaveBeenCalledWith(
                'service',
                expect.stringContaining('FallbackController.fallbackMethod'),
            );
            expect(mockCls.set).toHaveBeenCalledWith(
                'operation',
                'fallbackMethod',
            );
        });
    });

    describe('getContextRpc', () => {
        it('should return mapped context if found', () => {
            const ctx = {
                switchToRpc: () => ({
                    getContext: () => ({
                        getMessage: () => ({
                            fields: { routingKey: 'queue.name' },
                        }),
                        getPattern: () => 'rpc.pattern',
                    }),
                }),
            };
            (ContextMethod as any)['rpc.pattern'] = {
                service: 'RpcService',
                operation: 'RpcOp',
            };
            const result = (ClsService as any).getContextRpc(ctx);
            expect(result).toEqual({
                service: 'RpcService',
                operation: 'RpcOp',
            });
        });

        it('should return fallback context if not mapped', () => {
            const ctx = {
                switchToRpc: () => ({
                    getContext: () => ({
                        getMessage: () => ({
                            fields: { routingKey: 'queue.name' },
                        }),
                        getPattern: () => 'unmapped.pattern',
                    }),
                }),
            };
            const result = (ClsService as any).getContextRpc(ctx);
            expect(result).toEqual({
                service: 'unmapped.pattern',
                operation: 'pattern',
            });
        });
    });

    describe('getContextHttp', () => {
        it('should return mapped context if found', () => {
            const ctx = {
                getClass: () => ({ name: 'HttpController' }),
                getHandler: () => ({ name: 'httpMethod' }),
            };
            (ContextMethod as any)['HttpController.httpMethod'] = {
                service: 'HttpService',
                operation: 'HttpOp',
            };
            const result = (ClsService as any).getContextHttp(ctx);
            expect(result).toEqual({
                service: 'HttpService',
                operation: 'HttpOp',
            });
        });

        it('should return fallback context if not mapped', () => {
            const ctx = {
                getClass: () => ({ name: 'OtherController' }),
                getHandler: () => ({ name: 'otherMethod' }),
            };
            const result = (ClsService as any).getContextHttp(ctx);
            expect(result).toEqual({
                service: 'OtherController.otherMethod',
                operation: 'otherMethod',
            });
        });
    });
});
