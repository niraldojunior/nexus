export const MessageErrorRequest = {
    TOO_LONG: `O campo $property extrapola o limite de caracteres`,
    ISREQUIRED: `O campo $property é obrigatório`,
    EMPTY: `O campo $property não pode ser vazio`,
    INVALID: `O campo $property está inválido`,
    INVALID_DATE: `O campo $property está com a data inválida, Ex: 2023-03-07T23:44:00`,
    MIN_DATE: `O campo $property dever ser maior que a data atual`,
    ISARRAY: `O campo $property deve ser um array`,
    MAXLENGTH: `O campo $property ultrapassa o limite de caracteres`,
    MINLENGTH: `O campo $property não atinge o limite de caracteres`,
    MINARRAY: `O campo $property deve ter no mínimo $constraint1 itens`,
} as const;

export type MessageErrorRequestType =
    (typeof MessageErrorRequest)[keyof typeof MessageErrorRequest];
