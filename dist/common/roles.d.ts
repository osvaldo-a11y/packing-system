export declare const ROLES: {
    readonly ADMIN: "admin";
    readonly SUPERVISOR: "supervisor";
    readonly OPERATOR: "operator";
};
export type AppRole = (typeof ROLES)[keyof typeof ROLES];
