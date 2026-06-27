export const LifecycleStatus = {
    ACTIVE: 'Active',
    DISABLED: 'Inactive',
} as const;

export type LifecycleStatus =
    (typeof LifecycleStatus)[keyof typeof LifecycleStatus];
