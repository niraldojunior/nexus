import { ObjectId } from 'mongodb';
import { Column, Entity, Index, ObjectIdColumn } from 'typeorm';

import { LifecycleStatus } from '@/module/resource-catalog/domain/const/lifecycle.const';
import { TimePeriodModel } from '@/module/resource-catalog/domain/model/common.model';
import {
    ResourceSpecificationCatalogRefModel,
    ResourceSpecificationCategoryRefModel,
    ResourceSpecificationCharacteristicModel,
} from '@/module/resource-catalog/domain/model/resource-specification.model';

@Entity('tmf634_resource_specification')
@Index('IDX_RESOURCE_SPECIFICATION_NAME', ['name', 'resourceCategory'], {
    unique: true,
})
export class ResourceSpecificationDocument {
    @ObjectIdColumn()
    _id?: ObjectId;

    @Index({ unique: true })
    @Column()
    id: string;

    @Column({ nullable: true })
    href?: string;

    @Column()
    name: string;

    @Column({ nullable: true })
    description?: string;

    @Column({ nullable: true })
    version?: string;

    @Column({ nullable: true })
    category?: string;

    @Index({ unique: true })
    @Column()
    uniqueKey: string;

    @Index()
    @Column()
    lifecycleStatus: LifecycleStatus;

    @Column()
    resourceCatalog: ResourceSpecificationCatalogRefModel[];

    @Column()
    resourceCategory: ResourceSpecificationCategoryRefModel[];

    @Column({ nullable: true })
    resourceSpecCharacteristic?: ResourceSpecificationCharacteristicModel[];

    @Column({ nullable: true })
    validFor?: TimePeriodModel;

    @Index()
    @Column({ nullable: true })
    validForStartDateTime?: Date;

    @Index()
    @Column({ nullable: true })
    validForEndDateTime?: Date | null;

    @Column({ nullable: true })
    '@type'?: string;

    @Column({ nullable: true })
    '@baseType'?: string;

    @Column({ nullable: true })
    '@schemaLocation'?: string;

    @Column()
    createdAt: Date;

    @Column()
    updatedAt: Date;
}
