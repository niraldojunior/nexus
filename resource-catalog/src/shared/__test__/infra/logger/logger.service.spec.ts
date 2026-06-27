import { CLS_ID, ClsService } from 'nestjs-cls';
import { PinoLogger } from 'nestjs-pino';

import { EnvironmentConfigService } from '@/shared/infra/config/env/environment-config.service';
import { LoggerService } from '@/shared/infra/logger/logger.service';

describe('LoggerService', () => {
    let logger: LoggerService;
    let mockPinoLogger: jest.Mocked<PinoLogger>;
    let mockConfigService: jest.Mocked<EnvironmentConfigService>;
    let mockCls: jest.Mocked<ClsService>;

    beforeEach(() => {
        mockPinoLogger = {
            setContext: jest.fn(),
            trace: jest.fn(),
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        } as any;

        mockConfigService = {
            get: jest.fn((key: string) => {
                if (key === 'LOGSTASH_INDEX') return 'test-app';
                return undefined;
            }),
        } as any;

        mockCls = {
            set: jest.fn(),
            get: jest.fn(),
            getId: jest.fn().mockReturnValue('req-id'),
        } as any;

        logger = new LoggerService(mockPinoLogger, mockConfigService, mockCls);
    });

    it('should set _app_name from configService', () => {
        expect((logger as any)._app_name).toBe('test-app');
    });

    describe('clearContext', () => {
        it('should set CLS_ID, service, and operation to new values', () => {
            logger.clearContext();
            expect(mockCls.set).toHaveBeenCalledWith(
                CLS_ID,
                expect.any(String),
            );
            expect(mockCls.set).toHaveBeenCalledWith('service', null);
            expect(mockCls.set).toHaveBeenCalledWith('operation', null);
        });
    });

    describe('assign', () => {
        it('should assign requestId, service, and operation', () => {
            logger.assign({ requestId: 'id', service: 'svc', operation: 'op' });
            expect(mockCls.set).toHaveBeenCalledWith(CLS_ID, 'id');
            expect(mockCls.set).toHaveBeenCalledWith('service', 'svc');
            expect(mockCls.set).toHaveBeenCalledWith('operation', 'op');
        });

        it('should assign only provided fields', () => {
            logger.assign({ service: 'svc' });
            expect(mockCls.set).toHaveBeenCalledWith('service', 'svc');
            expect(mockCls.set).not.toHaveBeenCalledWith(
                CLS_ID,
                expect.anything(),
            );
            expect(mockCls.set).not.toHaveBeenCalledWith(
                'operation',
                expect.anything(),
            );
        });
    });

    describe('setContext', () => {
        it('should call setContext on PinoLogger', () => {
            logger.setContext('ctx');
            expect(mockPinoLogger.setContext).toHaveBeenCalledWith('ctx');
        });
    });

    describe('verbose', () => {
        it('should call trace with merged info', () => {
            logger.verbose({ foo: 'bar' }, 'msg');
            expect(mockPinoLogger.trace).toHaveBeenCalledWith(
                expect.objectContaining({
                    foo: 'bar',
                    requestId: 'req-id',
                    app_name: 'test-app',
                }),
                'msg',
            );
        });

        it('should wrap string obj as info', () => {
            logger.verbose('info-string' as any, 'msg');
            expect(mockPinoLogger.trace).toHaveBeenCalledWith(
                expect.objectContaining({ info: 'info-string' }),
                'msg',
            );
        });
    });

    describe('debug', () => {
        it('should call debug with merged info', () => {
            logger.debug({ foo: 'bar' }, 'msg');
            expect(mockPinoLogger.debug).toHaveBeenCalledWith(
                expect.objectContaining({
                    foo: 'bar',
                    requestId: 'req-id',
                    app_name: 'test-app',
                }),
                'msg',
            );
        });

        it('should wrap string obj as info', () => {
            logger.debug('info-string' as any, 'msg');
            expect(mockPinoLogger.debug).toHaveBeenCalledWith(
                expect.objectContaining({ info: 'info-string' }),
                'msg',
            );
        });
    });

    describe('info', () => {
        it('should call info with merged info', () => {
            logger.info({ foo: 'bar' }, 'msg');
            expect(mockPinoLogger.info).toHaveBeenCalledWith(
                expect.objectContaining({
                    foo: 'bar',
                    requestId: 'req-id',
                    app_name: 'test-app',
                }),
                'msg',
            );
        });

        it('should wrap string obj as info', () => {
            logger.info('info-string' as any, 'msg');
            expect(mockPinoLogger.info).toHaveBeenCalledWith(
                expect.objectContaining({ info: 'info-string' }),
                'msg',
            );
        });
    });

    describe('warn', () => {
        it('should call warn with merged info', () => {
            logger.warn({ foo: 'bar' }, 'msg');
            expect(mockPinoLogger.warn).toHaveBeenCalledWith(
                expect.objectContaining({
                    foo: 'bar',
                    requestId: 'req-id',
                    app_name: 'test-app',
                }),
                'msg',
            );
        });

        it('should wrap string obj as info', () => {
            logger.warn('info-string' as any, 'msg');
            expect(mockPinoLogger.warn).toHaveBeenCalledWith(
                expect.objectContaining({ info: 'info-string' }),
                'msg',
            );
        });
    });

    describe('error', () => {
        it('should call error with merged info', () => {
            logger.error({ foo: 'bar' }, 'msg', 'trace');
            expect(mockPinoLogger.error).toHaveBeenCalledWith(
                expect.objectContaining({
                    foo: 'bar',
                    requestId: 'req-id',
                    app_name: 'test-app',
                }),
                'msg',
            );
        });

        it('should wrap string obj as info and include trace', () => {
            logger.error('info-string' as any, 'msg', 'trace');
            expect(mockPinoLogger.error).toHaveBeenCalledWith(
                expect.objectContaining({
                    info: 'info-string',
                    trace: 'trace',
                }),
                'msg',
            );
        });
    });
});
