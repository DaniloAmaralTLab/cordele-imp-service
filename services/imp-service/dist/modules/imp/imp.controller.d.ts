import { type AuthenticatedUser } from '../../infrastructure/auth/jwt-auth.guard';
import { ImpEntity } from '../../domain/imp.entity';
import { CreateImpDto } from './dto/create-imp.dto';
import { UpdateImpDto } from './dto/update-imp.dto';
import { ImpService } from './imp.service';
export declare class ImpController {
    private readonly impService;
    constructor(impService: ImpService);
    create(dto: CreateImpDto, user: AuthenticatedUser): Promise<ImpEntity>;
    findAll(user: AuthenticatedUser, page?: number, size?: number): Promise<{
        items: ImpEntity[];
        total: number;
    }>;
    findOne(id: string, user: AuthenticatedUser): Promise<ImpEntity>;
    update(id: string, dto: UpdateImpDto, user: AuthenticatedUser): Promise<ImpEntity>;
    remove(id: string, user: AuthenticatedUser): Promise<void>;
}
