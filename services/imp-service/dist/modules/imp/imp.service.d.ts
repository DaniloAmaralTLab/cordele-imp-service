import { ImpEntity } from '../../domain/imp.entity';
import { ImpDomainService } from '../../domain/imp.domain-service';
import { ImpRepositoryPort, type ImpPage, type PageRequest } from '../../domain/imp.repository.interface';
import { type AuthenticatedUser } from '../../infrastructure/auth/jwt-auth.guard';
import { CreateImpDto } from './dto/create-imp.dto';
import { UpdateImpDto } from './dto/update-imp.dto';
export declare class ImpService {
    private readonly repository;
    private readonly domainService;
    private readonly logger;
    constructor(repository: ImpRepositoryPort, domainService: ImpDomainService);
    create(dto: CreateImpDto, user: AuthenticatedUser): Promise<ImpEntity>;
    findAll(user: AuthenticatedUser, page: PageRequest): Promise<ImpPage>;
    findOne(id: string, user: AuthenticatedUser): Promise<ImpEntity>;
    update(id: string, dto: UpdateImpDto, user: AuthenticatedUser): Promise<ImpEntity>;
    remove(id: string, user: AuthenticatedUser): Promise<void>;
}
