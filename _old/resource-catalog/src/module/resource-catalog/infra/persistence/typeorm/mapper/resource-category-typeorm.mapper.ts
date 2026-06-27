import { ResourceCategoryModel } from '@/module/resource-catalog/domain/model/resource-category.model';

import { ResourceCategoryDocument } from '../document/resource-category.document';

export class ResourceCategoryTypeOrmMapper {
    static toDocument(model: ResourceCategoryModel): ResourceCategoryDocument {
        const startDateTime = this.toDate(model.validFor?.startDateTime);
        const endDateTime = this.toNullableDate(model.validFor?.endDateTime);

        return {
            id: model.id,
            href: model.href,
            name: model.name,
            description: model.description,
            version: model.version,
            category: model.category,
            lifecycleStatus: model.lifecycleStatus,
            resourceCatalog: model.resourceCatalog,
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

    static toModel(document: ResourceCategoryDocument): ResourceCategoryModel {
        return {
            id: document.id,
            href: document.href,
            name: document.name || '',
            description: document.description,
            version: document.version,
            category: document.category,
            lifecycleStatus: document.lifecycleStatus,
            resourceCatalog: document.resourceCatalog,
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
