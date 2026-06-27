import { ObjectId } from 'mongodb';
import { Column, Entity, Index, ObjectIdColumn } from 'typeorm';

@Entity('tmf634_hub_subscription')
export class HubSubscriptionDocument {
    @ObjectIdColumn()
    _id?: ObjectId;

    @Index({ unique: true })
    @Column()
    id: string;

    @Column()
    callback: string;

    @Column()
    event: string;

    @Column({ nullable: true })
    query?: string;

    @Column({ nullable: true })
    credentials?: string;

    @Index()
    @Column()
    active: boolean;

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
