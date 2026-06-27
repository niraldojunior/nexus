import { Module } from '@nestjs/common';

import { AuditHttpModule } from './audit/audit.module';
import { HubHttpModule } from './hub/hub.module';
import { ResourceCandidateHttpModule } from './resource-candidate/resource-candidate.module';
import { ResourceCatalogHttpModule } from './resource-catalog/resource-catalog.module';
import { ResourceCategoryHttpModule } from './resource-category/resource-category.module';
import { ResourceSpecificationHttpModule } from './resource-specification/resource-specification.module';

@Module({
    imports: [
        ResourceCatalogHttpModule,
        ResourceCategoryHttpModule,
        ResourceSpecificationHttpModule,
        ResourceCandidateHttpModule,
        HubHttpModule,
        AuditHttpModule,
    ],
})
export class HttpModule {}
