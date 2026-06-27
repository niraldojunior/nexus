import {
    createParamDecorator,
    ExecutionContext,
    HttpException,
    HttpStatus,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateOrReject } from 'class-validator';

export const RequestHeader = createParamDecorator(
    async (HeadersDto: any, ctx: ExecutionContext) => {
        // extract headers
        const headers = ctx.switchToHttp().getRequest().headers;
        // Convert headers to DTO object
        const dto = plainToInstance(HeadersDto, headers, {
            excludeExtraneousValues: true,
        });
        // Validate
        return validateOrReject(dto).then(
            () => dto,
            (errors) => {
                const allErrors: string[] = [];
                errors.forEach((e) => {
                    Object.values(e.constraints).forEach((msg: any) => {
                        allErrors.push(msg);
                    });
                });

                throw new HttpException(
                    {
                        statusCode: HttpStatus.BAD_REQUEST,
                        message: allErrors,
                        error: 'Bad Request Header',
                    },
                    HttpStatus.BAD_REQUEST,
                );
            },
        );
    },
);
