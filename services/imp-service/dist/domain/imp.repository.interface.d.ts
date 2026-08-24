import { ImpEntity } from './imp.entity';
export interface PageRequest {
    readonly page: number;
    readonly size: number;
}
export interface ImpPage {
    readonly items: ImpEntity[];
    readonly total: number;
}
export interface ImpRepositoryPort {
    save(entity: ImpEntity, tenantId: string): Promise<ImpEntity>;
    findById(id: string, tenantId: string): Promise<ImpEntity | null>;
    findAll(page: PageRequest, tenantId: string): Promise<ImpPage>;
    deleteById(id: string, tenantId: string): Promise<void>;
}
export declare const ImpRepositoryPort: unique symbol;
