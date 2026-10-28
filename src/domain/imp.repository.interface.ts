import { ImpEntity } from './imp.entity';

export interface PageRequest {
  readonly page: number;
  readonly size: number;
}

export interface ImpPage {
  readonly items: ImpEntity[];
  readonly total: number;
}

/**
 * Outbound port for IMP persistence.
 *
 * The application layer depends on this interface only. The concrete Prisma
 * adapter is bound in `imp.module.ts`; swapping storage engines
 * must not require touching anything above this line.
 *
 * Every operation is scoped by empresa — there is no
 * cross-empresa read path by design.
 */
export interface ImpRepositoryPort {
  save(entity: ImpEntity, empresaId: string): Promise<ImpEntity>;

  findById(id: string, empresaId: string): Promise<ImpEntity | null>;

  findAll(page: PageRequest, empresaId: string): Promise<ImpPage>;

  deleteById(id: string, empresaId: string): Promise<void>;
}

/**
 * Injection token for ImpRepositoryPort.
 *
 * TypeScript interfaces are erased at runtime, so the port needs an explicit
 * token to be usable as a Nest provider key.
 */
export const ImpRepositoryPort = Symbol('ImpRepositoryPort');
