import { Injectable, Logger } from '@nestjs/common';

import { ImpEntity } from '../../domain/imp.entity';
import type {
  ImpPage,
  ImpRepositoryPort,
  PageRequest,
} from '../../domain/imp.repository.interface';
import { PrismaService } from './prisma.service';
import { ImpMapper } from './imp.mapper';

/**
 * Prisma-backed adapter for the IMP repository port (D-545).
 *
 * `PrismaService` is injected — never instantiate `PrismaClient` here, or the
 * process ends up with one connection pool per module.
 */
@Injectable()
export class PrismaImpRepository implements ImpRepositoryPort {
  private readonly logger = new Logger(PrismaImpRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async save(
    entity: ImpEntity,
    empresaId: string,
  ): Promise<ImpEntity> {
    if (entity.empresaId !== empresaId) {
      throw new Error('IMP: cross-empresa write rejected');
    }
    const model = await this.prisma.imp.upsert({
      where: { id: entity.id },
      create: ImpMapper.toCreateInput(entity),
      update: ImpMapper.toUpdateInput(entity),
    });
    return ImpMapper.toDomain(model);
  }

  async findById(
    id: string,
    empresaId: string,
  ): Promise<ImpEntity | null> {
    const model = await this.prisma.imp.findFirst({
      where: { id, empresaId },
    });
    return model ? ImpMapper.toDomain(model) : null;
  }

  async findAll(
    page: PageRequest,
    empresaId: string,
  ): Promise<ImpPage> {
    const size = Math.min(Math.max(page.size, 1), 200);
    const skip = Math.max(page.page - 1, 0) * size;
    const where = { empresaId };

    const [models, total] = await this.prisma.$transaction([
      this.prisma.imp.findMany({
        where,
        skip,
        take: size,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.imp.count({ where }),
    ]);

    return { items: ImpMapper.toDomainList(models), total };
  }

  async deleteById(
    id: string,
    empresaId: string,
  ): Promise<void> {
    await this.prisma.imp.deleteMany({
      where: { id, empresaId },
    });
    this.logger.debug(`IMP row deleted: ${id}`);
  }
}
