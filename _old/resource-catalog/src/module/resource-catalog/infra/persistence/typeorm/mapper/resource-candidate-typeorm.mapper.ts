import { ResourceCandidateModel } from '@/module/resource-catalog/domain/model/resource-candidate.model';

import { ResourceCandidateDocument } from '../document/resource-candidate.document';

export class ResourceCandidateTypeOrmMapper {
    static toDocument(
        model: ResourceCandidateModel,
    ): ResourceCandidateDocument {
        return {
            id: model.id,
            href: model.href,
            name: model.name,
            description: model.description,
            version: model.version,
            lifecycleStatus: model.lifecycleStatus,
            resourceSpecification: model.resourceSpecification,
            resourceSpecificationId: model.resourceSpecification.id,
            category: model.category,
            catalog: model.catalog,
            validFor: model.validFor,
            '@type': model['@type'],
            '@baseType': model['@baseType'],
            '@schemaLocation': model['@schemaLocation'],
            createdAt: model.createdAt ?? new Date(),
            updatedAt: model.updatedAt ?? new Date(),
        };
    }

    static toModel(
        document: ResourceCandidateDocument,
    ): ResourceCandidateModel {
        return {
            id: document.id,
            href: document.href,
            name: document.name || '',
            description: document.description,
            version: document.version,
            lifecycleStatus: document.lifecycleStatus,
            resourceSpecification: document.resourceSpecification,
            category: document.category,
            catalog: document.catalog,
            validFor: document.validFor,
            '@type': document['@type'],
            '@baseType': document['@baseType'],
            '@schemaLocation': document['@schemaLocation'],
            createdAt: document.createdAt,
            updatedAt: document.updatedAt,
        };
    }
}
