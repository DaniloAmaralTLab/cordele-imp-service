import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

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

/**
 * Domain service for IMP (IMP).
 *
 * Holds the business rules that do not belong to a single entity instance:
 * construction policies, cross-field validation and state transitions. It is
 * `@Injectable` for convenience but stays free of infrastructure imports.
 */
@Injectable()
export class ImpDomainService {
  /** Materializes a brand new aggregate from a validated command. */
  createFrom(command: CreateImpCommand): ImpEntity {
    const now = new Date();
    return new ImpEntity({
      id: randomUUID(),
      name: command.name.trim(),
      description: command.description?.trim(),
      status: command.status ?? ImpStatus.ACTIVE,
      tenantId: command.tenantId,
      createdAt: now,
      updatedAt: now,
    });
  }

  /** Applies a partial change set, enforcing the allowed status transitions. */
  applyChanges(current: ImpEntity, command: ChangeImpCommand): ImpEntity {
    if (command.status && !this.canTransition(current.status, command.status)) {
      throw new Error(
        `ImpDomainService: illegal transition ${current.status} -> ${command.status}`,
      );
    }

    return current.with({
      name: command.name?.trim(),
      description: command.description?.trim(),
      status: command.status,
    });
  }

  /** ARCHIVED is terminal; ACTIVE and INACTIVE toggle freely. */
  canTransition(from: ImpStatus, to: ImpStatus): boolean {
    if (from === to) {
      return true;
    }
    return from !== ImpStatus.ARCHIVED;
  }
}
