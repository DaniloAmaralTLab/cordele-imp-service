import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type {
  AdvanceProjetoStatusInput,
  AdvanceProjetoStatusPort,
} from '../../../domain/imp/ports/proj-port';

/**
 * HTTP adapter for `AdvanceProjetoStatusPort` (IMP-INT-002).
 *
 * Calls `POST /api/v1/proj/projetos/:projetoId/advance-status` on the PROJ service.
 * The bearer token from the originating request is forwarded so the PROJ
 * service can authenticate the call under the same user principal.
 *
 * Error handling:
 *  - 5xx / network error → exception propagated (ProjetoIntegrationError wraps it in the use case)
 *  - 409 Conflict → idempotent: logged as warn, NOT re-thrown (the use case treats this as success)
 *  - other 4xx → logged + exception propagated
 *
 * RULE-05: infrastructure/ does not import modules/; only domain port types (type-only).
 * RULE-06: outbound HTTP clients live only in `infrastructure/proj/http/`.
 * RULE-08: no console.log — Nest Logger only.
 */
@Injectable()
export class AdvanceProjetoStatusAdapter implements AdvanceProjetoStatusPort {
  private readonly logger = new Logger(AdvanceProjetoStatusAdapter.name);
  private readonly projBaseUrl: string;

  constructor(config: ConfigService) {
    this.projBaseUrl =
      config.get<string>('PROJ_SERVICE_BASE_URL') ?? 'http://localhost:3003';
  }

  async advance(input: AdvanceProjetoStatusInput): Promise<void> {
    const url = `${this.projBaseUrl}/api/v1/proj/projetos/${input.projetoId}/advance-status`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(input.bearerToken ? { Authorization: input.bearerToken } : {}),
        },
        body: JSON.stringify({ targetStatus: input.targetStatus }),
      });
    } catch (err) {
      this.logger.error(
        `PROJ network error advancing status of projeto ${input.projetoId} to ${input.targetStatus}`,
        err as Error,
      );
      throw new Error(
        `PROJ service unreachable while advancing status: ${(err as Error).message}`,
      );
    }

    // 409 means the transition is already done or illegal — treated as idempotent no-op
    // (ConfirmEstruturaUseCase wraps failures in ProjetoIntegrationError anyway).
    if (response.status === 409) {
      this.logger.warn(
        `PROJ returned 409 advancing projeto ${input.projetoId} to ${input.targetStatus} — transition already done or illegal; treating as idempotent`,
      );
      return;
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      this.logger.error(
        `PROJ returned HTTP ${response.status} advancing projeto ${input.projetoId} to ${input.targetStatus} — ${body}`,
      );
      throw new Error(
        `PROJ service returned HTTP ${response.status} while advancing status`,
      );
    }

    this.logger.log(
      `PROJ advanced projeto ${input.projetoId} to ${input.targetStatus} empresa=${input.empresaId}`,
    );
  }
}
