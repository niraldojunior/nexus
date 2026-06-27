import { Module } from '@nestjs/common';

import { DatabaseType } from '@/shared/infra/config/env/environment-config.validation';
import { LoggerModule } from '@/shared/infra/logger/logger.module';
import { AppTypeOrmModule } from '@/shared/infra/persistence/typeorm/app-typeorm.module';

import { AuditDocument } from './document/audit.document';
import { HubSubscriptionDocument } from './document/hub-subscription.document';
import { ResourceCandidateDocument } from './document/resource-candidate.document';
import { ResourceCatalogDocument } from './document/resource-catalog.document';
import { ResourceCategoryDocument } from './document/resource-category.document';
import { ResourceSpecificationDocument } from './document/resource-specification.document';
import { AuditTypeOrmRepository } from './repository/audit-typeorm.repository';
import { HubSubscriptionTypeOrmRepository } from './repository/hub-subscription-typeorm.repository';
import { ResourceCandidateTypeOrmRepository } from './repository/resource-candidate-typeorm.repository';
import { ResourceCatalogTypeOrmRepository } from './repository/resource-catalog-typeorm.repository';
import { ResourceCategoryTypeOrmRepository } from './repository/resource-category-typeorm.repository';
import { ResourceSpecificationTypeOrmRepository } from './repository/resource-specification-typeorm.repository';

@Module({
    imports: [
        LoggerModule,
        AppTypeOrmModule.forRootAsync(
            {
                entities: [
                    ResourceCatalogDocument,
                    ResourceCategoryDocument,
                    ResourceSpecificationDocument,
                    ResourceCandidateDocument,
                    HubSubscriptionDocument,
                    AuditDocument,
                ],
            },
            DatabaseType.MongoDB,
        ),
    ],
    providers: [
        ResourceCatalogTypeOrmRepository,
        ResourceCategoryTypeOrmRepository,
        ResourceSpecificationTypeOrmRepository,
        ResourceCandidateTypeOrmRepository,
        HubSubscriptionTypeOrmRepository,
        AuditTypeOrmRepository,
    ],
    exports: [
        ResourceCatalogTypeOrmRepository,
        ResourceCategoryTypeOrmRepository,
        ResourceSpecificationTypeOrmRepository,
        ResourceCandidateTypeOrmRepository,
        HubSubscriptionTypeOrmRepository,
        AuditTypeOrmRepository,
    ],
})
export class Tmf634TypeOrmModule {}
