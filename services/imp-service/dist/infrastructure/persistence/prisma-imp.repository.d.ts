import { ImpEntity } from '../../domain/imp.entity';
import type { ImpPage, ImpRepositoryPort, PageRequest } from '../../domain/imp.repository.interface';
import { PrismaService } from './prisma.service';
export declare class PrismaImpRepository implements ImpRepositoryPort {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    save(entity: ImpEntity, tenantId: string): Promise<ImpEntity>;
    findById(id: string, tenantId: string): Promise<ImpEntity | null>;
    findAll(page: PageRequest, tenantId: string): Promise<ImpPage>;
    deleteById(id: string, tenantId: string): Promise<void>;
}
