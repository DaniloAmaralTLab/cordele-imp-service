import { ImpEntity, ImpStatus } from './imp.entity';
export interface CreateImpCommand {
    readonly name: string;
    readonly description?: string;
    readonly status?: ImpStatus;
    readonly tenantId: string;
}
export interface ChangeImpCommand {
    readonly name?: string;
    readonly description?: string;
    readonly status?: ImpStatus;
}
export declare class ImpDomainService {
    createFrom(command: CreateImpCommand): ImpEntity;
    applyChanges(current: ImpEntity, command: ChangeImpCommand): ImpEntity;
    canTransition(from: ImpStatus, to: ImpStatus): boolean;
}
