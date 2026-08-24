import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { ImpEntity } from '../../domain/imp.entity';
import { ImpDomainService } from '../../domain/imp.domain-service';
import {
  ImpRepositoryPort,
  type ImpPage,
  type PageRequest,
} from '../../domain/imp.repository.interface';
import { type AuthenticatedUser } from '../../infrastructure/auth/jwt-auth.guard';
import { CreateImpDto } from './dto/create-imp.dto';
import { UpdateImpDto } from './dto/update-imp.dto';

/**
 * Application service for IMP (IMP).
 *
 * Orchestrates use cases: it loads aggregates through the repository port,
 * asks the domain service to decide, persists the outcome and publishes the
 * resulting integration events. It depends on ports only — never on Prisma.
 */
@Injectable()
export class ImpService {
  private readonly logger = new Logger(ImpService.name);

  constructor(
    @Inject(ImpRepositoryPort)
    private readonly repository: ImpRepositoryPort,
    private readonly domainService: ImpDomainService,
  ) {}

  async create(dto: CreateImpDto, user: AuthenticatedUser): Promise<ImpEntity> {
    const entity = this.domainService.createFrom({
      name: dto.name,
      description: dto.description,
      status: dto.status,
      tenantId: user.tenantId,
    });

    const saved = await this.repository.save(entity, user.tenantId);
    this.logger.log(`IMP created: ${saved.id}`);
    return saved;
  }

  async findAll(user: AuthenticatedUser, page: PageRequest): Promise<ImpPage> {
    return this.repository.findAll(page, user.tenantId);
  }

  async findOne(id: string, user: AuthenticatedUser): Promise<ImpEntity> {
    const found = await this.repository.findById(id, user.tenantId);
    if (!found) {
      throw new NotFoundException(`IMP ${id} not found`);
    }
    return found;
  }

  async update(
    id: string,
    dto: UpdateImpDto,
    user: AuthenticatedUser,
  ): Promise<ImpEntity> {
    const current = await this.findOne(id, user);
    const next = this.domainService.applyChanges(current, dto);
    const saved = await this.repository.save(next, user.tenantId);
    return saved;
  }

  async remove(id: string, user: AuthenticatedUser): Promise<void> {
    await this.findOne(id, user);
    await this.repository.deleteById(id, user.tenantId);
    this.logger.log(`IMP deleted: ${id}`);
  }
}
