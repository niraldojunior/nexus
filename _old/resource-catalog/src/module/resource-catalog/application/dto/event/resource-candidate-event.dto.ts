import { ResourceCandidateModel } from '@/module/resource-catalog/domain/model/resource-candidate.model';

import { EventEnvelope } from './tmf634-event.dto';

export type ResourceCandidateCreateEventDto = EventEnvelope<{
    resourceCandidate: ResourceCandidateModel;
}>;

export type ResourceCandidateAttributeValueChangeEventDto = EventEnvelope<{
    resourceCandidate: ResourceCandidateModel;
}>;

export type ResourceCandidateStatusChangeEventDto = EventEnvelope<{
    resourceCandidate: ResourceCandidateModel;
}>;
