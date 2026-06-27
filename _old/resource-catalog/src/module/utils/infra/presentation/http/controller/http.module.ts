import { Module } from '@nestjs/common';

import { UtilsHttpModule } from './utils/utils.module';

@Module({
    imports: [UtilsHttpModule],
})
export class HttpModule {}
