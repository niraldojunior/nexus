import { ObjectId } from 'mongodb';
import { Column, Entity, Index, ObjectIdColumn } from 'typeorm';

import { LifecycleStatus } from '@/module/resource-catalog/domain/const/lifecycle.const';
import { TimePeriodModel } from '@/module/resource-catalog/domain/model/common.model';

@Entity('tmf634_resource_catalog')
export class ResourceCatalogDocument {
    @ObjectIdColumn()
    _id?: ObjectId;

    @Index({ unique: true })
    @Column()
    id: string;

    @Column({ nullable: true })
    href?: string;

    @Index({ unique: true })
    @Column()
    name: string;

    @Column({ nullable: true })
    description?: string;

    @Column({ nullable: true })
    version?: string;

    @Index()
    @Column()
    lifecycleStatus: LifecycleStatus;

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
