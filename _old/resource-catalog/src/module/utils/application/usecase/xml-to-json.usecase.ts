import { Inject } from '@nestjs/common';

import { UtilXmlToJsonRequestDto } from '@/module/utils/application/dto/request/xml-to-json.dto';
import { BadRequestError } from '@/shared/application/error/bad-request.error';
import { InternalServerError } from '@/shared/application/error/internal-server.error';
import { Either, left, right } from '@/shared/application/type/either';
import { LoggerService } from '@/shared/infra/logger/logger.service';
import { safeStringify } from '@/shared/util/json.util';
import { xmlToJson } from '@/shared/util/xml.util';

export type UtilXmlToJsonResponse = Either<
    BadRequestError | InternalServerError,
    string
>;

export class XmlToJsonUseCase {
    constructor(
        @Inject(LoggerService) private readonly logger: LoggerService,
    ) {}

    exec(dto: UtilXmlToJsonRequestDto): UtilXmlToJsonResponse {
        try {
            this.logger.setContext(this.constructor.name);

            if (!dto) {
                return left(
                    new BadRequestError('Parâmetros ausentes ou inválidos'),
                );
            }

            const result = xmlToJson(dto.data);

            if (!result) {
                return left(
                    new InternalServerError('Erro ao converter XML em JSON'),
                );
            }

            return right(result);
        } catch (err: any) {
            this.logger.error(
                {
                    context: this.constructor.name,
                    description: this.constructor.name,
                },
                safeStringify({
                    name: err.name,
                    message: err.message,
                    stack: err.stack,
                }),
            );
            return left(err);
        }
    }
}
