import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import {
    HUB_SUBSCRIPTION_REPOSITORY,
    HubSubscriptionRepository,
} from '@/module/resource-catalog/application/port/hub-subscription.repository';

@Injectable()
export class DeleteHubUseCase {
    constructor(
        @Inject(HUB_SUBSCRIPTION_REPOSITORY)
        private readonly repository: HubSubscriptionRepository,
    ) {}

    async exec(id: string): Promise<void> {
        const existing = await this.repository.findById(id);

        if (!existing) {
            throw new NotFoundException(
                `Hub subscription with id '${id}' was not found`,
            );
        }

        await this.repository.patchById(id, {
            active: false,
            updatedAt: new Date(),
        });
    }
}
