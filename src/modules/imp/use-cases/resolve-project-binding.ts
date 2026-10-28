import type {
  CreateProjetoEditorialPort,
} from '../../../domain/imp/ports/proj-port';
import { ProjetoIntegrationError } from '../../../domain/imp/errors';

export interface ProjectBindingInput {
  readonly manuscritoId: string;
  readonly titulo: string;
  readonly empresaId: string;
}

export interface ProjectBindingOutput {
  readonly projetoId: string;
}

/**
 * Helper compartilhado entre ImportManuscriptUseCase e ConfirmEstruturaUseCase.
 *
 * Chama CreateProjetoEditorialPort e mapeia falhas para ProjetoIntegrationError.
 * Não importa @prisma/client nem infrastructure/ (RULE-01/02/04).
 */
export async function resolveProjectBinding(
  port: CreateProjetoEditorialPort,
  input: ProjectBindingInput,
): Promise<ProjectBindingOutput> {
  try {
    const result = await port.create({
      manuscritoId: input.manuscritoId,
      titulo: input.titulo,
      empresaId: input.empresaId,
    });
    return { projetoId: result.projetoId };
  } catch (err) {
    throw new ProjetoIntegrationError(
      err instanceof Error ? err.message : String(err),
      err,
    );
  }
}
