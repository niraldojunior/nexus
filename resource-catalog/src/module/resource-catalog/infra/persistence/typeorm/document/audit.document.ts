import { ObjectId } from 'mongodb';
import { Column, Entity, Index, ObjectIdColumn } from 'typeorm';

@Entity('tmf634_audit')
export class AuditDocument {
    @ObjectIdColumn()
    _id?: ObjectId;

    @Index({ unique: true })
    @Column()
    id: string;

    @Index()
    @Column()
    userId: string;

    @Column()
    action: string;

    @Index()
    @Column()
    entityId: string;

    @Index()
    @Column()
    entityType: string;

    @Index()
    @Column()
    timestamp: Date;
}
