import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { NotificationEvent } from '@/module/resource-catalog/domain/const/notification-event.const';

export class HubDto {
    @ApiProperty({ description: 'Hub subscription identifier' })
    id: string;

    @ApiProperty({ description: 'Subscriber callback URL' })
    callback: string;

    @ApiProperty({
        description: 'Subscriber event used to filter events',
    })
    event: NotificationEvent;

    @ApiPropertyOptional({
        description:
            'Optional query filter expression to narrow event dispatch by payload values (e.g. event.resourceSpecification.resourceCatalog.id=123,456)',
        example: 'event.resourceSpecification.resourceCatalog.id=123,456',
    })
    query?: string;

    @ApiPropertyOptional({
        description:
            'Optional credentials for subscriber authentication, if required by the callback endpoint',
        example: 'Y2xpZW50SWQ6c2VjcmV0',
    })
    credentials?: string;

    @ApiPropertyOptional({ description: 'Subscription active flag' })
    active?: boolean;

    @ApiPropertyOptional({
        description: 'Entity creation timestamp',
        example: new Date().toISOString(),
    })
    createdAt?: string;

    @ApiPropertyOptional({
        description: 'Entity update timestamp',
        example: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    })
    updatedAt?: string;

    @ApiPropertyOptional({
        description: 'Last update timestamp (TMF style)',
        example: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    })
    lastUpdate?: string;

    @ApiPropertyOptional({ description: 'Resource type discriminator' })
    '@type'?: string;

    @ApiPropertyOptional({ description: 'Base resource type discriminator' })
    '@baseType'?: string;

    @ApiPropertyOptional({ description: 'Schema location for this resource' })
    '@schemaLocation'?: string;
}
