import {
    ArgumentsHost,
    Catch,
    ExceptionFilter,
    HttpException,
    HttpStatus,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';

import { StatusCodeConstant } from '@/shared/application/const/status-code.constant';
import { TmfErrorDto } from '@/shared/application/dto/tmf/tmf-error.dto';
import { LoggerService } from '@/shared/infra/logger/logger.service';
import { safeStringify } from '@/shared/util/json.util';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
    constructor(private readonly logger: LoggerService) {}

    catch(exception: HttpException, host: ArgumentsHost): void {
        this.logger.setContext('Exception');
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<FastifyReply>();
        const request = ctx.getRequest<{ headers?: Record<string, unknown> }>();
        const statusCode =
            exception.getStatus() || HttpStatus.INTERNAL_SERVER_ERROR;
        const message = exception.getResponse();
        const responseTime = this.computeResponseTime(request);
        const reason = this.extractReasonParts(message);

        if (statusCode >= 400) {
            this.logger.info(
                { description: 'INFO ERRO' },
                safeStringify({
                    statusCode,
                    message,
                    reason,
                }),
            );
        }

        const tmfErrorDto = new TmfErrorDto({
            code: statusCode,
            message:
                typeof message === 'string'
                    ? message
                    : StatusCodeConstant[statusCode]?.message ||
                      StatusCodeConstant[HttpStatus.INTERNAL_SERVER_ERROR]
                          .message,
            reason,
        });

        this.logger.error(
            {
                description: 'END - Finalizacao do servico',
                responseTime,
                statusCode,
            },
            safeStringify(tmfErrorDto),
        );

        response.status(statusCode).send(tmfErrorDto);
    }

    private computeResponseTime(request: {
        headers?: Record<string, unknown>;
    }): number {
        const startTimeHeader = request?.headers?.startTime;
        const startTime =
            typeof startTimeHeader === 'number'
                ? startTimeHeader
                : typeof startTimeHeader === 'string'
                  ? Number(startTimeHeader)
                  : Array.isArray(startTimeHeader) &&
                      typeof startTimeHeader[0] === 'string'
                    ? Number(startTimeHeader[0])
                    : Number.NaN;

        return Number.isFinite(startTime) ? Date.now() - startTime : 0;
    }

    private extractReasonParts(message: unknown): string[] {
        if (typeof message === 'string') {
            return message.trim() ? [message] : [];
        }

        if (!message || typeof message !== 'object') {
            return [];
        }

        const payload = message as Record<string, unknown>;
        const reason: string[] = [];

        if (typeof payload.message === 'string' && payload.message.trim()) {
            reason.push(payload.message);
        }

        if (Array.isArray(payload.message)) {
            for (const item of payload.message) {
                if (typeof item === 'string' && item.trim()) {
                    reason.push(item);
                }
            }
        }

        if (
            typeof payload.description === 'string' &&
            payload.description.trim()
        ) {
            reason.push(payload.description);
        }

        return reason;
    }
}
