import { ForbiddenRequestError } from '@/shared/application/error/forbiden-request.error';

export class User {
    private readonly sub: string;
    private readonly id: string;
    private readonly name: string;
    private readonly email: string[];
    private readonly role: UserRole[];

    constructor(dto: {
        sub: string;
        id: string;
        name: string;
        email: string[];
        role: UserRole[];
    }) {
        this.id = dto.id;
        this.email = dto.email;
        this.name = dto.name;
        this.role = dto.role;
        this.sub = dto.sub;

        if (!this.id) {
            throw new ForbiddenRequestError('User ID is required');
        }

        if (!this.validateRole(Object.values(UserRead))) {
            throw new ForbiddenRequestError('Invalid role');
        }
    }

    getId(): string {
        return this.id;
    }

    validateRole(requiredRoles: UserRole[]): boolean {
        return this.role.some((role) => requiredRoles.includes(role));
    }
}

const UserBase = {
    USER: 'user',
} as const;

const UserAdmin = {
    ADMIN: 'admin',
} as const;

const UserEngenharia = {
    ADMIN_ENGENHARIA: 'admin_engenharia',
    USER_ENGENHARIA: 'user_engenharia',
    OPERACAO_ENGENHARIA_N2: 'operacao_engenharia_n2',
} as const;

const UserProdutos = {
    PRODUTOS_ADMIN: 'produtos_admin',
    PRODUTOS_USER: 'produtos_user',
} as const;

const UserOperacaoN2 = {
    OPERACAO_N2_ADMIN: 'operacao_n2_admin',
    OPERACAO_N2: 'operacao_n2',
} as const;

const UserOperacaoN3 = {
    OPERACAO_N3_ADMIN: 'operacao_n3_admin',
    OPERACAO_N3: 'operacao_n3',
} as const;

export const UserWrite = {
    ...Object.entries(UserProdutos)
        .filter(([_, v]) => v.includes('admin'))
        .reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {}),
    ...UserAdmin,
    ...UserOperacaoN2,
} as const;

export const UserRead = {
    ...UserWrite,
    ...UserProdutos,
    ...UserOperacaoN3,
} as const;

export const UserRole = {
    ...UserBase,
    ...UserAdmin,
    ...UserRead,
    ...UserWrite,
    ...UserEngenharia,
    ...UserProdutos,
    ...UserOperacaoN2,
    ...UserOperacaoN3,
} as const;

export type UserRead = (typeof UserRead)[keyof typeof UserRead];
export type UserWrite = (typeof UserWrite)[keyof typeof UserWrite];
export type UserRole = (typeof UserRole)[keyof typeof UserRole];
