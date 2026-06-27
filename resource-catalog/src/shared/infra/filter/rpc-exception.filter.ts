import {
    ArgumentsHost,
    Catch,
    HttpException,
    HttpStatus,
} from '@nestjs/common';
import { BaseRpcExceptionFilter, RpcException } from '@nestjs/microservices';
import { AxiosResponse } from 'axios';
import { Observable } from 'rxjs';

import { StatusCodeConstant } from '@/shared/application/const/status-code.constant';
import { TmfErrorDto } from '@/shared/application/dto/tmf/tmf-error.dto';
import { safeStringify } from '@/shared/util/json.util';

import { LoggerService } from '../logger/logger.service';

@Catch()
export class RpcExceptionFilter extends BaseRpcExceptionFilter {
    constructor(private readonly logger: LoggerService) {
        super();
    }

    catch(
        error: RpcException & {
            message?: string | any;
            status?: number;
            response?: AxiosResponse['data'];
        },
        host: ArgumentsHost,
    ): Observable<any> {
        if (host.getType() === 'http') {
            throw new HttpException(
                error.message,
                error.status || HttpStatus.INTERNAL_SERVER_ERROR,
                error,
            );
        }

        const ctx = host.switchToRpc();
        const headers = ctx.getContext().getMessage().properties.headers || {};
        const statusCode = error.status || HttpStatus.INTERNAL_SERVER_ERROR;
        const message = error.message || 'Internal server error';
        const responseTime = Date.now() - headers['startTime'];

        if (statusCode >= 400)
            this.logger.info(
                { description: 'INFO ERRO' },
                safeStringify({
                    message,
                    description: error.response?.description,
                    data: error.response?.data,
                    stack: error.stack,
                }),
            );

        // const controlDto = new ControlDto(
        //     {
        //         ...(Object.hasOwn(message, 'message')
        //             ? { data: message.message }
        //             : error.cause
        //               ? { data: error.cause }
        //               : {}),
        //         ...(Object.hasOwn(message, 'description')
        //             ? { description: message.description }
        //             : {}),
        //     },
        //     {
        //         type: statusCode > 499 ? 'T' : 'E',
        //         code: statusCode,
        //         message:
        //             typeof message === 'string'
        //                 ? message
        //                 : StatusCodeConstant[statusCode]?.message ||
        //                   StatusCodeConstant[500].message,
        //     },
        // );

        const tmfErrorDto = new TmfErrorDto({
            code: statusCode,
            message:
                typeof message === 'string'
                    ? message
                    : StatusCodeConstant[statusCode]?.message ||
                      StatusCodeConstant[500].message,
            reason: [
                Object.hasOwn(message, 'message') ? message.message : '',
                error.cause ? safeStringify(error.cause) : '',
                Object.hasOwn(message, 'description')
                    ? message.description
                    : '',
            ],
        });

        this.logger.error(
            {
                description: 'END - Finalização do serviço',
                responseTime,
                statusCode,
                address: error.response?.address,
                stack: error.stack,
            },
            safeStringify(tmfErrorDto),
        );

        return super.catch(error, host);
    }
}
