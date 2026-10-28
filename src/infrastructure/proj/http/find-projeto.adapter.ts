import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { FindProjetoOutput, FindProjetoPort } from '../../../domain/imp/ports/find-projeto.port';

/**
 * Raw shape of `ProjetoDetailDto` returned by `GET /api/v1/proj/projetos/:id`.
 * Only `id` is needed; remaining fields are silently ignored.
 */
interface ProjDetailResponse {
  readonly id: string;
}

/**
 * HTTP adapter for `FindProjetoPort`.
 *
 * Calls `GET /api/v1/proj/projetos/:projetoId` on the PROJ service.
 * The bearer token from the originating request is forwarded so the PROJ
 * service can authenticate the call under the same user principal.
 *
 * Error handling:
 *  - 404 → returns `null` (contract: never reveal cross-tenant existence)
 *  - 5xx / network error → exception propagated (import fails)
 *  - other 4xx → logged + exception propagated
 *
 * Imports only domain port types from outside infrastructure/; logs through the Nest Logger.
 */
@Injectable()
export class FindProjetoAdapter implements FindProjetoPort {
  private readonly logger = new Logger(FindProjetoAdapter.name);
  private readonly projBaseUrl: string;

  constructor(config: ConfigService) {
    this.projBaseUrl = config.getOrThrow<string>('PROJ_SERVICE_BASE_URL');
  }

  async findById(
    projetoId: string,
    empresaId: string,
    bearerToken?: string,
  ): Promise<FindProjetoOutput | null> {
    const url = `${this.projBaseUrl}/api/v1/proj/projetos/${projetoId}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          ...(bearerToken ? { Authorization: bearerToken } : {}),
        },
      });
    } catch (err) {
      this.logger.error(
        `PROJ network error finding projeto ${projetoId} empresa=${empresaId}`,
        err as Error,
      );
      throw new Error(
        `PROJ service unreachable while finding projeto: ${(err as Error).message}`,
      );
    }

    if (response.status === 404) {
      this.logger.debug(
        `PROJ returned 404 for projeto ${projetoId} empresa=${empresaId} — not found`,
      );
      return null;
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      this.logger.error(
        `PROJ returned HTTP ${response.status} finding projeto ${projetoId} empresa=${empresaId} — ${body}`,
      );
      throw new Error(
        `PROJ service returned HTTP ${response.status} while finding projeto`,
      );
    }

    let data: ProjDetailResponse;
    try {
      data = (await response.json()) as ProjDetailResponse;
    } catch (err) {
      this.logger.error(
        `PROJ returned non-JSON response finding projeto ${projetoId}`,
        err as Error,
      );
      throw new Error('PROJ service returned non-JSON response while finding projeto');
    }

    return { projetoId: data.id };
  }
}
