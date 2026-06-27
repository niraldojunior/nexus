export const StatusCodeConstant = {
    400: { message: 'Bad Request', statusCode: 400 },
    401: { message: 'Unauthorized', statusCode: 401 },
    403: { message: 'Forbidden - Scope Not Permitted', statusCode: 403 },
    404: { message: 'Not Found', statusCode: 404 },
    409: { message: 'Conflict', statusCode: 409 },
    406: { message: 'Not Acceptable', statusCode: 406 },
    422: { message: 'Unprocessable Entity', statusCode: 422 },
    429: { message: 'Too Many Requests - Exceeded Quota', statusCode: 429 },
    500: { message: 'Internal Server Error', statusCode: 500 },
    503: { message: 'Service Unavailable', statusCode: 503 },
    504: { message: 'Gateway Timeout', statusCode: 504 },
    ECONNRESET: { message: 'Internal Server Error', statusCode: 500 },
    ECONNABORTED: { message: 'Internal Server Error', statusCode: 500 },
};

const STATUS_API_GETEWAY = {
    ...StatusCodeConstant,
    4012: {
        message: 'Priorização de agendamento não autorizado.',
        statusCode: 401,
    },
};

export const GET_ERROR_API_GATEWAY = (
    code: number | string = 500,
): { statusCode: number; message: string } => {
    return STATUS_API_GETEWAY[code]
        ? STATUS_API_GETEWAY[code]
        : STATUS_API_GETEWAY[500];
};
