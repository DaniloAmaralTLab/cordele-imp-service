import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import {
  ArquivoGrandeDemaisError,
  FormatoNaoSuportadoError,
  ManuscritoNaoEncontradoError,
  ProjectBindingInvalidError,
  ProjetoNaoEncontradoError,
} from '../../domain/imp/errors';
import { ManuscriptParseError } from '../../domain/imp/ports/manuscript-parser.port';

/**
 * Filtro de exceção global para respostas RFC 7807 (Problem Detail).
 *
 * Mapeamento de erros de domínio IMP → problem types conforme api-contract.md §5.
 *
 * Registrado no AppModule via APP_FILTER (não em ImpModule — RULE-04).
 * Captura tanto erros de domínio (subclasses de Error) quanto HttpException do NestJS.
 */
@Catch()
export class ProblemDetailFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const detail = this.resolveDetail(exception, request);

    this.logger.warn(
      `ProblemDetail — ${detail.status} ${detail.type} — ${request.method} ${request.url}`,
    );

    response
      .status(detail.status)
      .setHeader('Content-Type', 'application/problem+json')
      .json(detail);
  }

  private resolveDetail(
    exception: unknown,
    request: Request,
  ): ProblemDetailPayload {
    const instance = request.url;

    // ── Domain errors IMP → problem types ────────────────────────────────────

    if (exception instanceof FormatoNaoSuportadoError) {
      return {
        type: 'urn:cordele:imp:unsupported-format',
        title: 'Unsupported file format',
        status: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        detail: exception.message,
        instance,
      };
    }

    if (exception instanceof ArquivoGrandeDemaisError) {
      return {
        type: 'urn:cordele:imp:file-too-large',
        title: 'Manuscript exceeds the maximum upload size',
        status: HttpStatus.PAYLOAD_TOO_LARGE,
        detail: exception.message,
        instance,
      };
    }

    if (exception instanceof ProjectBindingInvalidError) {
      return {
        type: 'urn:cordele:imp:invalid-project-binding',
        title: 'Invalid project binding',
        status: HttpStatus.BAD_REQUEST,
        detail: exception.message,
        instance,
      };
    }

    if (exception instanceof ProjetoNaoEncontradoError) {
      return {
        type: 'urn:cordele:imp:projeto-not-found',
        title: 'Project not found in the active empresa',
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        detail: exception.message,
        instance,
      };
    }

    if (exception instanceof ManuscriptParseError) {
      return {
        type: 'urn:cordele:imp:parse-failed',
        title: 'Manuscript parse failed',
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        detail: exception.message,
        instance,
      };
    }

    if (exception instanceof ManuscritoNaoEncontradoError) {
      return {
        type: 'urn:cordele:imp:not-found',
        title: 'Manuscript not found',
        status: HttpStatus.NOT_FOUND,
        detail: exception.message,
        instance,
      };
    }

    // ── NestJS HttpException passthrough ─────────────────────────────────────

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const detail =
        typeof body === 'string'
          ? body
          : typeof body === 'object' && body !== null && 'message' in body
            ? String((body as Record<string, unknown>)['message'])
            : String(body);

      return {
        type: this.httpTypeFromStatus(status),
        title: exception.message,
        status,
        detail,
        instance,
      };
    }

    // ── Unexpected error → 500 ────────────────────────────────────────────────

    this.logger.error('Unhandled exception', exception instanceof Error ? exception.stack : String(exception));

    return {
      type: 'urn:cordele:imp:internal-error',
      title: 'Internal server error',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      detail: 'An unexpected error occurred.',
      instance,
    };
  }

  private httpTypeFromStatus(status: number): string {
    switch (status) {
      case 400: return 'urn:cordele:imp:validation';
      case 401: return 'urn:cordele:imp:unauthorized';
      case 403: return 'urn:cordele:imp:forbidden';
      case 404: return 'urn:cordele:imp:not-found';
      case 413: return 'urn:cordele:imp:file-too-large';
      case 415: return 'urn:cordele:imp:unsupported-format';
      case 422: return 'urn:cordele:imp:unprocessable';
      default: return `urn:cordele:imp:http-${status}`;
    }
  }
}

interface ProblemDetailPayload {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
}
