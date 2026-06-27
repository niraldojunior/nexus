import { Inject } from '@nestjs/common';

import { UtilCodeFormatRequestDto } from '@/module/utils/application/dto/request/code-format.dto';
import { BadRequestError } from '@/shared/application/error/bad-request.error';
import { InternalServerError } from '@/shared/application/error/internal-server.error';
import { Either, left, right } from '@/shared/application/type/either';
import { LoggerService } from '@/shared/infra/logger/logger.service';
import { PrettierService } from '@/shared/infra/service/code-formatter/prettier.service';
import { LzService } from '@/shared/infra/service/lz/lz.service';
import { safeStringify } from '@/shared/util/json.util';

export type UtilCodeFormatResponse = Either<
    BadRequestError | InternalServerError,
    string
>;

export class CodeFormatUseCase {
    constructor(
        @Inject(LoggerService)
        private readonly logger: LoggerService,
        @Inject(PrettierService)
        private readonly formatService: PrettierService,
        @Inject(LzService)
        private readonly compressionService: LzService,
    ) {}

    async exec(dto: UtilCodeFormatRequestDto): Promise<UtilCodeFormatResponse> {
        try {
            this.logger.setContext(this.constructor.name);

            if (!dto) {
                return left(
                    new BadRequestError('Parâmetros ausentes ou inválidos'),
                );
            }

            if (dto.compression?.enabled) {
                dto.data = this.compressionService.decompress(dto.data, {
                    algorithm: dto.compression.algorithm,
                });
            }

            let result: string;

            switch (dto.options.filetype) {
                case 'hbs':
                    result = await this.formatService.formatHbs(dto.data);
                    break;
                default:
                    return left(
                        new BadRequestError('Tipo de arquivo não suportado'),
                    );
            }

            if (!result) {
                return left(new InternalServerError('Erro ao formatar código'));
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
