import type { Prisma, Imp as ImpModel } from '@prisma/client';
import { ImpEntity } from '../../domain/imp.entity';
export declare class ImpMapper {
    static toDomain(model: ImpModel): ImpEntity;
    static toDomainList(models: ImpModel[]): ImpEntity[];
    static toCreateInput(entity: ImpEntity): Prisma.ImpUncheckedCreateInput;
    static toUpdateInput(entity: ImpEntity): Prisma.ImpUncheckedUpdateInput;
}
