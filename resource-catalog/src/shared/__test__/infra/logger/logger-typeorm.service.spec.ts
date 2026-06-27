import { LoggerService } from '@/shared/infra/logger/logger.service';
import { TypeOrmLoggerService } from '@/shared/infra/logger/logger-typeorm.service';

describe('TypeOrmLoggerService', () => {
    let logger: jest.Mocked<LoggerService>;
    let service: TypeOrmLoggerService;

    beforeEach(() => {
        logger = {
            info: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn(),
        } as any;
        service = new TypeOrmLoggerService(logger);
    });

    describe('logQuery', () => {
        it('should log info with normalized query and parameters', () => {
            service.logQuery('SELECT  *   FROM  table', [1, 2]);
            expect(logger.info).toHaveBeenCalledWith(
                expect.objectContaining({
                    description: 'INVOKE - REQUEST ENVIADO AO BD',
                    integration: true,
                }),
                expect.stringContaining('SELECT * FROM table'),
            );
        });

        it('should log info with normalized query and undefined parameters', () => {
            service.logQuery('SELECT  *   FROM  table');
            expect(logger.info).toHaveBeenCalledWith(
                expect.any(Object),
                expect.stringContaining('SELECT * FROM table'),
            );
        });
    });

    describe('logQueryError', () => {
        it('should log error with normalized query, parameters, and error', () => {
            service.logQueryError('fail', 'SELECT   * FROM  table', [3]);
            expect(logger.error).toHaveBeenCalledWith(
                expect.objectContaining({
                    description: 'ERROR RECEBIDO DO BD',
                    integration: true,
                }),
                expect.stringContaining('fail'),
            );
            expect(logger.error).toHaveBeenCalledWith(
                expect.any(Object),
                expect.stringContaining('SELECT * FROM table'),
            );
        });
    });

    describe('logQuerySlow', () => {
        it('should log warn with normalized query, parameters, and time', () => {
            service.logQuerySlow(123, 'SELECT   * FROM  table', [4]);
            expect(logger.warn).toHaveBeenCalledWith(
                expect.objectContaining({
                    description: 'INVOKE - REQUEST ENVIADO AO BD - SLOW',
                    integration: true,
                }),
                expect.stringContaining('SELECT * FROM table'),
            );
            expect(logger.warn).toHaveBeenCalledWith(
                expect.any(Object),
                expect.stringContaining('123'),
            );
        });
    });

    describe('logSchemaBuild', () => {
        it('should log debug with message', () => {
            service.logSchemaBuild('schema build message');
            expect(logger.debug).toHaveBeenCalledWith(
                {},
                'schema build message',
            );
        });
    });

    describe('logMigration', () => {
        it('should log debug with message', () => {
            service.logMigration('migration message');
            expect(logger.debug).toHaveBeenCalledWith({}, 'migration message');
        });
    });

    describe('log', () => {
        it('should call warn for warn level', () => {
            service.log('warn', { foo: 'bar' });
            expect(logger.warn).toHaveBeenCalledWith({ foo: 'bar' });
        });

        it('should call info for log level', () => {
            service.log('log', { foo: 'bar' });
            expect(logger.info).toHaveBeenCalledWith({ foo: 'bar' });
        });

        it('should call info for info level', () => {
            service.log('info', { foo: 'bar' });
            expect(logger.info).toHaveBeenCalledWith({ foo: 'bar' });
        });
    });
});
