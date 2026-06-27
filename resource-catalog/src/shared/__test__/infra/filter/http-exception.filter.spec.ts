import { ArgumentsHost, BadRequestException } from '@nestjs/common';

import { HttpExceptionFilter } from '@/shared/infra/filter/http-exception.filter';
import { LoggerService } from '@/shared/infra/logger/logger.service';

describe('HttpExceptionFilter', () => {
    const makeLoggerMock = (): jest.Mocked<
        Pick<LoggerService, 'setContext' | 'info' | 'error'>
    > => ({
        setContext: jest.fn(),
        info: jest.fn(),
        error: jest.fn(),
    });

    it('should return TMF error payload without stack/cause details', () => {
        const logger = makeLoggerMock() as unknown as LoggerService;
        const filter = new HttpExceptionFilter(logger);

        const reply = {
            status: jest.fn(),
            send: jest.fn(),
        };
        reply.status.mockReturnValue(reply);

        const host = {
            switchToHttp: () => ({
                getResponse: () => reply,
                getRequest: () => ({
                    headers: {
                        startTime: String(Date.now() - 50),
                    },
                }),
            }),
        } as unknown as ArgumentsHost;

        const exception = new BadRequestException([
            'name must be a string',
            'lifecycleStatus should not be empty',
        ]);

        filter.catch(exception, host);

        expect(reply.status).toHaveBeenCalledWith(400);
        expect(reply.send).toHaveBeenCalledTimes(1);

        const payload = reply.send.mock.calls[0][0] as {
            code: number;
            message: string;
            reason: string;
            stack?: string;
        };

        expect(payload.code).toBe(400);
        expect(payload.message).toBe('Bad Request');
        expect(payload.reason).toContain('name must be a string');
        expect(payload.reason).toContain('lifecycleStatus should not be empty');
        expect(payload.reason).not.toContain('stack');
        expect(payload.reason).not.toContain('Error:');
        expect(payload.stack).toBeUndefined();
    });
});
