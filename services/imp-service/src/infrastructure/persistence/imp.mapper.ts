import type { Prisma, Imp as ImpModel } from '@prisma/client';

import { ImpEntity, ImpStatus } from '../../domain/imp.entity';

/**
 * Translates between the IMP Prisma model and the domain entity.
 *
 * This is the only file allowed to know both shapes. Keeping it explicit
 * (instead of spreading the Prisma row into the entity) means a schema
 * rename shows up here as a compile error rather than as a silent
 * `undefined` deep in the domain.
 */
export class ImpMapper {
  static toDomain(model: ImpModel): ImpEntity {
    return new ImpEntity({
      id: model.id,
      name: model.name,
      description: model.description ?? undefined,
      status: model.status as ImpStatus,
      empresaId: model.empresaId,
      createdAt: model.createdAt,
      updatedAt: model.updatedAt,
    });
  }

  static toDomainList(models: ImpModel[]): ImpEntity[] {
    return models.map((model) => ImpMapper.toDomain(model));
  }

  static toCreateInput(entity: ImpEntity): Prisma.ImpUncheckedCreateInput {
    return {
      id: entity.id,
      name: entity.name,
      description: entity.description ?? null,
      status: entity.status,
      empresaId: entity.empresaId,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  static toUpdateInput(entity: ImpEntity): Prisma.ImpUncheckedUpdateInput {
    return {
      name: entity.name,
      description: entity.description ?? null,
      status: entity.status,
      updatedAt: entity.updatedAt,
    };
  }
}
