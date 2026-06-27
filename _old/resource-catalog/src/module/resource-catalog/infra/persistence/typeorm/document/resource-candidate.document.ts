import { ObjectId } from 'mongodb';
import { Column, Entity, Index, ObjectIdColumn } from 'typeorm';

import { LifecycleStatus } from '@/module/resource-catalog/domain/const/lifecycle.const';
import { TimePeriodModel } from '@/module/resource-catalog/domain/model/common.model';
import {
    ResourceCandidateCatalogRefModel,
    ResourceCandidateCategoryRefModel,
    ResourceCandidateSpecificationRefModel,
} from '@/module/resource-catalog/domain/model/resource-candidate.model';

@Entity('tmf634_resource_candidate')
export class ResourceCandidateDocument {
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

    @Index()
    @Column()
    lifecycleStatus: LifecycleStatus;

    @Column()
    resourceSpecification: ResourceCandidateSpecificationRefModel;

    @Index()
    @Column()
    resourceSpecificationId: string;

    @Column()
    category: ResourceCandidateCategoryRefModel[];

    @Column()
    catalog: ResourceCandidateCatalogRefModel;

    @Column({ nullable: true })
    validFor?: TimePeriodModel;

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
