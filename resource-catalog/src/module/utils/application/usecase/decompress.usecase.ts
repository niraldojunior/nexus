import { Inject } from '@nestjs/common';

import { UtilDecompressRequestDto } from '@/module/utils/application/dto/request/decompress.dto';
import { BadRequestError } from '@/shared/application/error/bad-request.error';
import { InternalServerError } from '@/shared/application/error/internal-server.error';
import { Either, left, right } from '@/shared/application/type/either';
import { LoggerService } from '@/shared/infra/logger/logger.service';
import { LzService } from '@/shared/infra/service/lz/lz.service';
import { safeStringify } from '@/shared/util/json.util';

export type UtilDecompressResponse = Either<
    BadRequestError | InternalServerError,
    { data: string; originalSize: number; size: number; ratio: string }
>;

export class DecompressUseCase {
    constructor(
        @Inject(LoggerService)
        private readonly logger: LoggerService,
        @Inject(LzService)
        private readonly compressionService: LzService,
    ) {}

    exec(dto: UtilDecompressRequestDto): UtilDecompressResponse {
        try {
            this.logger.setContext(this.constructor.name);

            if (!dto) {
                return left(
                    new BadRequestError('Parâmetros ausentes ou inválidos'),
                );
            }

            const result = this.compressionService.decompress(dto.data, {
                algorithm: dto.options?.algorithm,
            });

            if (!result) {
                return left(
                    new InternalServerError('Erro ao descomprimir dados'),
                );
            }

            return right({
                data: result,
                originalSize: dto.data.length,
                size: result.length,
                ratio:
                    Math.round(100 - (result.length / dto.data.length) * 100) +
                    '%',
            });
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
