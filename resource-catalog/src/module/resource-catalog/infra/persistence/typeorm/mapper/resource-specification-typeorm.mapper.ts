import { ResourceSpecificationModel } from '@/module/resource-catalog/domain/model/resource-specification.model';

import { ResourceSpecificationDocument } from '../document/resource-specification.document';

export class ResourceSpecificationTypeOrmMapper {
    static toDocument(
        model: ResourceSpecificationModel,
    ): ResourceSpecificationDocument {
        const startDateTime = this.toDate(model.validFor?.startDateTime);
        const endDateTime = this.toNullableDate(model.validFor?.endDateTime);

        return {
            id: model.id,
            href: model.href,
            name: model.name,
            description: model.description,
            version: model.version,
            category: model.category,
            uniqueKey: model.uniqueKey,
            lifecycleStatus: model.lifecycleStatus,
            resourceCatalog: model.resourceCatalog,
            resourceCategory: model.resourceCategory,
            resourceSpecCharacteristic: model.resourceSpecCharacteristic,
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

    static toModel(
        document: ResourceSpecificationDocument,
    ): ResourceSpecificationModel {
        return {
            id: document.id,
            href: document.href,
            name: document.name || '',
            description: document.description,
            version: document.version,
            category: document.category,
            uniqueKey: document.uniqueKey,
            lifecycleStatus: document.lifecycleStatus,
            resourceCatalog: document.resourceCatalog,
            resourceCategory: document.resourceCategory,
            resourceSpecCharacteristic: document.resourceSpecCharacteristic,
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
