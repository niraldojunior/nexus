import { LifecycleStatus } from '../const/lifecycle.const';

export interface TimePeriodModel {
    startDateTime?: string | Date;
    endDateTime?: string | Date | null;
}

export class TmfExtensibleModel {
    '@type'?: string;
    '@baseType'?: string;
    '@schemaLocation'?: string;
}

export class TmfPersistentModel extends TmfExtensibleModel {
    id: string;
    href?: string;
    lifecycleStatus: LifecycleStatus;
    validFor?: TimePeriodModel;
    createdAt?: Date;
    updatedAt?: Date;
}

export interface PagedResultModel<T> {
    items: T[];
    total: number;
}
