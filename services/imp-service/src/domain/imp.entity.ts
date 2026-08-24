/**
 * Lifecycle status of a IMP aggregate.
 */
export enum ImpStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  ARCHIVED = 'ARCHIVED',
}

export interface ImpProps {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly status: ImpStatus;
  readonly empresaId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * IMP aggregate root — IMP.
 *
 * Pure domain object: it knows its invariants and nothing about HTTP,
 * Prisma or Nest. Infrastructure converts to and from this shape through
 * the module mapper.
 */
export class ImpEntity {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly status: ImpStatus;
  /** Owning empresa; every query must be scoped by it. */
  readonly empresaId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: ImpProps) {
    ImpEntity.assertInvariants(props);
    this.id = props.id;
    this.name = props.name;
    this.description = props.description;
    this.status = props.status;
    this.empresaId = props.empresaId;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  /** Returns a copy with the given changes applied and `updatedAt` refreshed. */
  with(changes: Partial<Omit<ImpProps, 'id' | 'createdAt'>>): ImpEntity {
    return new ImpEntity({
      id: this.id,
      name: changes.name ?? this.name,
      description: changes.description ?? this.description,
      status: changes.status ?? this.status,
      empresaId: this.empresaId,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    });
  }

  isActive(): boolean {
    return this.status === ImpStatus.ACTIVE;
  }

  archive(): ImpEntity {
    return this.with({ status: ImpStatus.ARCHIVED });
  }

  private static assertInvariants(props: ImpProps): void {
    if (!props.id) {
      throw new Error('ImpEntity: id is required');
    }
    if (!props.name || props.name.trim().length < 2) {
      throw new Error('ImpEntity: name must have at least 2 characters');
    }
    if (!props.empresaId) {
      throw new Error('ImpEntity: empresa is required');
    }
  }
}
