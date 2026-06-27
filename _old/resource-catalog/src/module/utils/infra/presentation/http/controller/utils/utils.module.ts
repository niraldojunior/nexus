import { Module } from '@nestjs/common';

import { CodeFormatUseCase } from '@/module/utils/application/usecase/code-format.usecase';
import { CompressUseCase } from '@/module/utils/application/usecase/compress.usecase';
import { DecompressUseCase } from '@/module/utils/application/usecase/decompress.usecase';
import { XmlToJsonUseCase } from '@/module/utils/application/usecase/xml-to-json.usecase';
import { EnvironmentConfigModule } from '@/shared/infra/config/env/environment-config.module';
import { LoggerModule } from '@/shared/infra/logger/logger.module';
import { PrettierService } from '@/shared/infra/service/code-formatter/prettier.service';
import { LzService } from '@/shared/infra/service/lz/lz.service';

import { Utils } from './utils.controller';

@Module({
    imports: [EnvironmentConfigModule, LoggerModule],
    controllers: [Utils],
    providers: [
        LzService,
        PrettierService,
        CompressUseCase,
        DecompressUseCase,
        XmlToJsonUseCase,
        CodeFormatUseCase,
    ],
})
export class UtilsHttpModule {}
