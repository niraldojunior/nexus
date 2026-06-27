export const AuditAction = {
    CREATE: 'CREATE',
    UPDATE: 'UPDATE',
    DELETE: 'DELETE',
} as const;

export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];
