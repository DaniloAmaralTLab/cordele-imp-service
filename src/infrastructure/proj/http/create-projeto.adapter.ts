import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type {
  CreateProjetoEditorialInput,
  CreateProjetoEditorialOutput,
  CreateProjetoEditorialPort,
} from '../../../domain/imp/ports/proj-port';

/**
 * Raw shape of `ProjetoDetailDto` returned by `POST /api/v1/proj/projetos`.
 * Only `id` is needed; remaining fields are silently ignored.
 */
interface ProjCreateResponse {
  readonly id: string;
}

/**
 * HTTP adapter for `CreateProjetoEditorialPort` (IMP-INT-001).
 *
 * Calls `POST /api/v1/proj/projetos` on the PROJ service.
 * The bearer token from the originating request is forwarded so the PROJ
 * service can authenticate the call under the same user principal.
 *
 * Error handling:
 *  - 5xx / network error → exception propagated (import fails; use case must not persist)
 *  - 4xx → logged + exception propagated with a descriptive message
 *
 * RULE-05: infrastructure/ does not import modules/; only domain port types (type-only).
 * RULE-06: outbound HTTP clients live only in `infrastructure/proj/http/`.
 * RULE-08: no console.log — Nest Logger only.
 */
@Injectable()
export class CreateProjetoAdapter implements CreateProjetoEditorialPort {
  private readonly logger = new Logger(CreateProjetoAdapter.name);
  private readonly projBaseUrl: string;

  constructor(config: ConfigService) {
    this.projBaseUrl = config.getOrThrow<string>('PROJ_SERVICE_BASE_URL');
  }

  async create(
    input: CreateProjetoEditorialInput,
  ): Promise<CreateProjetoEditorialOutput> {
    const url = `${this.projBaseUrl}/api/v1/proj/projetos`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(input.bearerToken ? { Authorization: input.bearerToken } : {}),
        },
        body: JSON.stringify({ nome: input.titulo }),
      });
    } catch (err) {
      this.logger.error(
        `PROJ network error creating projeto for manuscrito ${input.manuscritoId}`,
        err as Error,
      );
      throw new Error(
        `PROJ service unreachable while creating projeto: ${(err as Error).message}`,
      );
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      this.logger.error(
        `PROJ returned HTTP ${response.status} creating projeto for manuscrito ${input.manuscritoId} — ${body}`,
      );
      throw new Error(
        `PROJ service returned HTTP ${response.status} while creating projeto`,
      );
    }

    let data: ProjCreateResponse;
    try {
      data = (await response.json()) as ProjCreateResponse;
    } catch (err) {
      this.logger.error(
        `PROJ returned non-JSON response creating projeto for manuscrito ${input.manuscritoId}`,
        err as Error,
      );
      throw new Error('PROJ service returned non-JSON response while creating projeto');
    }

    this.logger.log(
      `PROJ created projeto ${data.id} for manuscrito ${input.manuscritoId} empresa=${input.empresaId}`,
    );

    return { projetoId: data.id };
  }
}
