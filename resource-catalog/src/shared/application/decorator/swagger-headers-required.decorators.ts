import { applyDecorators } from '@nestjs/common';
import { ApiHeaders } from '@nestjs/swagger';

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function HeadersRequiredDecorators() {
    return applyDecorators(
        ApiHeaders([
            {
                name: 'companyId',
                description: 'Identificador da companhia',
                required: true,
                schema: { type: 'string' },
            },
            {
                name: 'clientId',
                description: 'Identificador do cliente',
                required: true,
                schema: { type: 'string' },
            },
        ]),
    );
}
