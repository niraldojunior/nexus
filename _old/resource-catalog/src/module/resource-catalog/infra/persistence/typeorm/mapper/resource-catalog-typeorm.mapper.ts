import { ResourceCatalogModel } from '@/module/resource-catalog/domain/model/resource-catalog.model';

import { ResourceCatalogDocument } from '../document/resource-catalog.document';

export class ResourceCatalogTypeOrmMapper {
    static toDocument(model: ResourceCatalogModel): ResourceCatalogDocument {
        const startDateTime = this.toDate(model.validFor?.startDateTime);
        const endDateTime = this.toNullableDate(model.validFor?.endDateTime);

        return {
            id: model.id,
            href: model.href,
            name: model.name,
            description: model.description,
            version: model.version,
            lifecycleStatus: model.lifecycleStatus,
            validFor: model.validFor,
            validForStartDateTime: startDateTime,
            validForEndDateTime: endDateTime,
            '@type': model['@type'],
            '@baseType': model['@baseType'],
            '@schemaLocation': model['@schemaLocation'],
            createdAt: model.createdAt ?? new Date(),
            updatedAt: model.updatedAt ?? new Date(),
        };
    }

    static toModel(document: ResourceCatalogDocument): ResourceCatalogModel {
        return {
            id: document.id,
            href: document.href,
            name: document.name || '',
            description: document.description,
            version: document.version,
            lifecycleStatus: document.lifecycleStatus,
            validFor: document.validFor || {
                startDateTime: document.validForStartDateTime,
                endDateTime: document.validForEndDateTime,
            },
            '@type': document['@type'],
            '@baseType': document['@baseType'],
            '@schemaLocation': document['@schemaLocation'],
            createdAt: document.createdAt,
            updatedAt: document.updatedAt,
        };
    }

    private static toDate(value?: string | Date): Date | undefined {
        if (!value) {
            return undefined;
        }
        if (value instanceof Date) {
            return value;
        }
        return new Date(value);
    }

    private static toNullableDate(
        value?: string | Date | null,
    ): Date | null | undefined {
        if (value === null) {
            return null;
        }
        return this.toDate(value);
    }
}
