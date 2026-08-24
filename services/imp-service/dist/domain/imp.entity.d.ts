export declare enum ImpStatus {
    ACTIVE = "ACTIVE",
    INACTIVE = "INACTIVE",
    ARCHIVED = "ARCHIVED"
}
export interface ImpProps {
    readonly id: string;
    readonly name: string;
    readonly description?: string;
    readonly status: ImpStatus;
    readonly tenantId: string;
    readonly createdAt: Date;
    readonly updatedAt: Date;
}
export declare class ImpEntity {
    readonly id: string;
    readonly name: string;
    readonly description?: string;
    readonly status: ImpStatus;
    readonly tenantId: string;
    readonly createdAt: Date;
    readonly updatedAt: Date;
    constructor(props: ImpProps);
    with(changes: Partial<Omit<ImpProps, 'id' | 'createdAt'>>): ImpEntity;
    isActive(): boolean;
    archive(): ImpEntity;
    private static assertInvariants;
}
