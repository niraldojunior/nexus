import { applyDecorators } from '@nestjs/common';
import {
    ApiBadRequestResponse,
    ApiExtraModels,
    ApiForbiddenResponse,
    ApiGatewayTimeoutResponse,
    ApiInternalServerErrorResponse,
    ApiNotAcceptableResponse,
    ApiNotFoundResponse,
    ApiServiceUnavailableResponse,
    ApiTooManyRequestsResponse,
    ApiUnauthorizedResponse,
    getSchemaPath,
} from '@nestjs/swagger';

import { ControlDto } from '../dto/control/control.dto';

interface IExample {
    ApiBadRequestResponse: {
        value: any;
    };
    ApiForbiddenResponse: {
        value: any;
    };
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function ResponseErrorsDecorators(example?: IExample) {
    return applyDecorators(
        ApiExtraModels(ControlDto),
        ApiBadRequestResponse({
            content: {
                'application/json': {
                    schema: {
                        $ref: getSchemaPath(ControlDto),
                    },
                    example: example?.ApiBadRequestResponse.value
                        ? example?.ApiBadRequestResponse.value
                        : {
                              control: {
                                  type: 'E',
                                  code: '400',
                                  message: 'Bad Request',
                              },
                          },
                },
            },
            description: 'Bad Request',
        }),
        ApiForbiddenResponse({
            content: {
                'application/json': {
                    schema: {
                        $ref: getSchemaPath(ControlDto),
                    },
                    example: {
                        control: {
                            type: 'E',
                            code: '403',
                            message: 'Forbidden - Scope Not Permitted',
                        },
                    },
                },
            },
            description: 'Forbidden - Scope Not Permitted',
        }),
        ApiUnauthorizedResponse({
            content: {
                'application/json': {
                    schema: {
                        $ref: getSchemaPath(ControlDto),
                    },
                    example: {
                        control: {
                            type: 'E',
                            code: '401',
                            message: 'Unauthorized',
                        },
                    },
                },
            },
            description: 'Unauthorized',
        }),
        ApiNotFoundResponse({
            content: {
                'application/json': {
                    schema: {
                        $ref: getSchemaPath(ControlDto),
                    },
                    example: {
                        control: {
                            type: 'E',
                            code: '404',
                            message: 'Not Found',
                        },
                    },
                },
            },
            description: 'Not Found',
        }),
        ApiNotAcceptableResponse({
            content: {
                'application/json': {
                    schema: {
                        $ref: getSchemaPath(ControlDto),
                    },
                    example: {
                        control: {
                            type: 'E',
                            code: '406',
                            message: 'Not Acceptable',
                        },
                    },
                },
            },
            description: 'Not Acceptable',
        }),
        ApiTooManyRequestsResponse({
            content: {
                'application/json': {
                    schema: {
                        $ref: getSchemaPath(ControlDto),
                    },
                    example: {
                        type: 'E',
                        code: '429',
                        message: 'Too Many Requests - Exceeded Quota',
                    },
                },
            },
            description: 'Too Many Requests - Exceeded Quota',
        }),
        ApiInternalServerErrorResponse({
            content: {
                'application/json': {
                    schema: {
                        $ref: getSchemaPath(ControlDto),
                    },
                    example: {
                        type: 'T',
                        code: '500',
                        message: 'Internal Server Error',
                    },
                },
            },
            description: 'Internal Server Error',
        }),
        ApiServiceUnavailableResponse({
            content: {
                'application/json': {
                    schema: {
                        $ref: getSchemaPath(ControlDto),
                    },
                    example: {
                        type: 'T',
                        code: '503',
                        message: 'Service Unavailable',
                    },
                },
            },
            description: 'Service Unavailable',
        }),
        ApiGatewayTimeoutResponse({
            content: {
                'application/json': {
                    schema: {
                        $ref: getSchemaPath(ControlDto),
                    },
                    example: {
                        type: 'T',
                        code: '504',
                        message: 'Gateway Timeout',
                    },
                },
            },
            description: 'Gateway Timeout',
        }),
    );
}
