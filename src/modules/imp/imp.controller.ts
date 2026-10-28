import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import type { AuthenticatedUser } from '../../domain/auth/authenticated-user';
import { CurrentUser } from './decorators/current-user.decorator';
import { RequiredScopes } from './decorators/require-scope.decorator';
import { EstruturaDto } from './dto/estrutura.dto';
import { IgnoreSegmentoDto } from './dto/ignore-segmento.dto';
import { IgnoredSegmentsDto } from './dto/ignored-segments.dto';
import { ManuscritoDetailDto } from './dto/manuscrito-detail.dto';
import { ManuscritoSummariesRequestDto } from './dto/manuscrito-summaries-request.dto';
import { ManuscritoSummaryItemDto } from './dto/manuscrito-summary-item.dto';
import { UploadManuscritoDto } from './dto/upload-manuscrito.dto';
import { ImpService } from './imp.service';

/**
 * HTTP adapter para o contexto IMP (Importação).
 *
 * Controllers são thin: validam via ValidationPipe + DTOs, delegam ao
 * application service e moldam a resposta HTTP.
 * Não importa nada de infrastructure/.
 * Proteção por JWT global via APP_GUARD em AppModule.
 */
@ApiTags('manuscripts')
@ApiBearerAuth('bearer')
@Controller('imp')
export class ImpController {
  constructor(private readonly impService: ImpService) {}

  /**
   * POST /api/imp/manuscripts
   * Upload e parse síncrono de manuscrito (multipart/form-data).
   * Requer scope `imp:write` (api-contract §4.1).
   */
  @Post('manuscripts')
  @RequiredScopes('imp:write')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload e parse síncrono de manuscrito' })
  @ApiCreatedResponse({ type: ManuscritoDetailDto, description: 'Manuscrito importado com sucesso.' })
  uploadManuscrito(
    @Body() dto: UploadManuscritoDto,
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Headers('authorization') authorization?: string,
  ): Promise<ManuscritoDetailDto> {
    if (!file) {
      throw new BadRequestException('O campo "file" (arquivo) é obrigatório.');
    }
    return this.impService.importManuscrito(dto, user, file, authorization);
  }

  /**
   * POST /api/imp/manuscripts/summaries
   * Consulta em lote: sumário de manuscrito por projetoId (interno — proj-service).
   *
   * Retorna o sumário (totalCapitulos + totalImagens) do manuscrito mais recente
   * de cada projetoId solicitado. Projetos sem manuscrito são omitidos do array.
   *
   * Deve estar declarado ANTES de `GET manuscripts/:id` para evitar ambiguidade
   * de rota — "summaries" como literal vs ":id" como parâmetro.
   *
   * Requer scope `imp:read` (api-contract §9).
   */
  @Post('manuscripts/summaries')
  @RequiredScopes('imp:read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Consulta em lote: sumário de manuscrito por projetoId (interno — proj-service)' })
  @ApiOkResponse({
    type: [ManuscritoSummaryItemDto],
    description: 'Sumários dos manuscritos mais recentes por projeto. Projetos sem manuscrito são omitidos.',
  })
  getSummaries(
    @Body() dto: ManuscritoSummariesRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ManuscritoSummaryItemDto[]> {
    return this.impService.getManuscritoSummaries(dto.projetoIds, user);
  }

  /**
   * GET /api/imp/manuscripts/:id
   * Detalhe de um manuscrito pelo id.
   * Requer scope `imp:read` (enforced by JwtAuthGuard via @RequiredScopes metadata).
   */
  @Get('manuscripts/:id')
  @RequiredScopes('imp:read')
  @ApiOperation({ summary: 'Obter detalhe de um manuscrito' })
  @ApiOkResponse({ type: ManuscritoDetailDto, description: 'Detalhe do manuscrito.' })
  getManuscrito(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ManuscritoDetailDto> {
    return this.impService.getManuscrito(id, user);
  }

  /**
   * GET /api/imp/manuscripts/:id/estrutura
   * Estrutura (ContentTree) de um manuscrito.
   * Requer scope `imp:read` (enforced by JwtAuthGuard via @RequiredScopes metadata).
   */
  @Get('manuscripts/:id/estrutura')
  @RequiredScopes('imp:read')
  @ApiOperation({ summary: 'Obter estrutura canônica do manuscrito' })
  @ApiOkResponse({ type: EstruturaDto, description: 'ContentTree do manuscrito.' })
  getEstrutura(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<EstruturaDto> {
    return this.impService.getEstrutura(id, user);
  }

  /**
   * GET /api/imp/projetos/:projetoId/manuscritos
   * Lista de manuscritos de um projeto.
   * Requer scope `imp:read` (api-contract §4.4).
   */
  @Get('projetos/:projetoId/manuscritos')
  @RequiredScopes('imp:read')
  @ApiOperation({ summary: 'Listar manuscritos de um projeto' })
  @ApiOkResponse({ type: [ManuscritoDetailDto], description: 'Lista de manuscritos do projeto.' })
  listManuscritosByProjeto(
    @Param('projetoId', ParseUUIDPipe) projetoId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ManuscritoDetailDto[]> {
    return this.impService.listManuscritosByProjeto(projetoId, user);
  }

  /**
   * POST /api/imp/manuscripts/:id/segmentos/:segId/ignore
   * Ignorar um segmento de curadoria.
   * Requer scope `imp:write` (api-contract §8, Port: imp:write — mutação de anotação).
   */
  @Post('manuscripts/:id/segmentos/:segId/ignore')
  @RequiredScopes('imp:write')
  @ApiOperation({ summary: 'Ignorar segmento de curadoria' })
  @ApiOkResponse({ description: 'Segmento ignorado com sucesso.' })
  ignoreSegmento(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('segId') segId: string,
    @Body() dto: IgnoreSegmentoDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.impService.ignoreSegmento(id, segId, dto, user);
  }

  /**
   * DELETE /api/imp/manuscripts/:id/segmentos/:segId/ignore
   * Restaurar (desfazer ignore) um segmento de curadoria.
   * Requer scope `imp:write` (api-contract §8 — deleção de anotação é mutação).
   */
  @Delete('manuscripts/:id/segmentos/:segId/ignore')
  @RequiredScopes('imp:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Restaurar segmento ignorado' })
  @ApiNoContentResponse({ description: 'Segmento restaurado (ignore desfeito).' })
  restoreSegmento(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('segId') segId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.impService.restoreSegmento(id, segId, user);
  }

  /**
   * GET /api/imp/manuscripts/:id/segmentos/ignored
   * Lista os ids dos segmentos atualmente ignorados de um manuscrito (usado ao abrir a revisão de estrutura).
   * Requer scope `imp:read` (enforced by JwtAuthGuard via @RequiredScopes metadata).
   */
  @Get('manuscripts/:id/segmentos/ignored')
  @RequiredScopes('imp:read')
  @ApiOperation({ summary: 'Listar segmentos ignorados do manuscrito' })
  @ApiOkResponse({ type: IgnoredSegmentsDto, description: 'IDs dos segmentos ignorados.' })
  listSegmentosIgnorados(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<IgnoredSegmentsDto> {
    return this.impService.listSegmentosIgnorados(id, user);
  }

  /**
   * POST /api/imp/manuscripts/:id/confirm-estrutura
   * Confirmar a estrutura de um manuscrito (avança o projeto para Composição).
   * Retorna 200 OK (contrato api-contract.md §8.3) — não cria recurso novo, é um comando.
   * Requer scope `imp:write` (api-contract §8.2, Port: imp:write — avanço de status).
   */
  @Post('manuscripts/:id/confirm-estrutura')
  @RequiredScopes('imp:write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirmar estrutura do manuscrito' })
  @ApiOkResponse({ description: 'Estrutura confirmada; manuscrito avançado para Composição.' })
  confirmEstrutura(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('authorization') authorization?: string,
  ): Promise<void> {
    return this.impService.confirmEstrutura(id, user, authorization);
  }
}
