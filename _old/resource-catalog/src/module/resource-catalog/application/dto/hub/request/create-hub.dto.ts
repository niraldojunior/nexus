import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsEnum,
    IsNotEmpty,
    IsOptional,
    IsString,
    IsUrl,
    MaxLength,
} from 'class-validator';

import { NotificationEvent } from '@/module/resource-catalog/domain/const/notification-event.const';
import { ResourceType } from '@/module/resource-catalog/domain/const/resource-type.const';

export class CreateHubDto {
    @ApiProperty({
        description: 'Subscriber callback URL that receives TMF634 events',
        example: 'http://localhost:3001/listener/tmf634',
    })
    @IsUrl({ require_tld: false })
    @IsNotEmpty()
    @MaxLength(200)
    callback: string;

    @ApiProperty({
        description: 'Optional subscriber filter event expression',
        enum: NotificationEvent,
    })
    @IsEnum(NotificationEvent)
    event: NotificationEvent;

    @ApiPropertyOptional({
        description:
            'Optional query filter expression to narrow event dispatch by payload values (e.g. event.resourceSpecification.resourceCatalog.id=123,456)',
        example: 'event.resourceSpecification.resourceCatalog.id=123,456',
    })
    @IsString()
    @IsOptional()
    @MaxLength(500)
    query?: string;

    @ApiPropertyOptional({
        description:
            'Optional credentials for subscriber authentication, if required by the callback endpoint (clientId:clientSecret encoded in Base64)',
        example: 'Y2xpZW50SWQ6c2VjcmV0', // Base64 for "clientId:secret"
    })
    @IsString()
    @IsOptional()
    @MaxLength(100)
    credentials?: string;

    @ApiPropertyOptional({
        description: 'Resource type discriminator',
        example: 'Hub',
        enum: [ResourceType.HUB],
    })
    @IsEnum([ResourceType.HUB])
    '@type': string = ResourceType.HUB;

    @ApiPropertyOptional({ description: 'Base resource type discriminator' })
    @IsString()
    @MaxLength(20)
    '@baseType': string = ResourceType.HUB;

    @ApiPropertyOptional({ description: 'Schema location for this resource' })
    @IsString()
    @IsOptional()
    @MaxLength(200)
    '@schemaLocation'?: string;

    createdAtStart?: string;
    createdAtEnd?: string;
    updatedAtStart?: string;
    updatedAtEnd?: string;
}
