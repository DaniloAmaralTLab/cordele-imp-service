import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
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
import { EstruturaDto } from './dto/estrutura.dto';
import { IgnoreSegmentoDto } from './dto/ignore-segmento.dto';
import { ManuscritoDetailDto } from './dto/manuscrito-detail.dto';
import { UploadManuscritoDto } from './dto/upload-manuscrito.dto';
import { ImpService } from './imp.service';

/**
 * HTTP adapter para o contexto IMP (Importação).
 *
 * Controllers são thin: validam via ValidationPipe + DTOs, delegam ao
 * application service e moldam a resposta HTTP.
 * Não importa nada de infrastructure/ (RULE-04).
 * Proteção por JWT global via APP_GUARD em AppModule.
 */
@ApiTags('manuscripts')
@ApiBearerAuth('bearer')
@Controller('imp')
export class ImpController {
  constructor(private readonly impService: ImpService) {}

  /**
   * POST /api/imp/manuscripts
   * Upload e parse síncrono de manuscrito (multipart/form-data — D-A / D-C).
   */
  @Post('manuscripts')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload e parse síncrono de manuscrito' })
  @ApiCreatedResponse({ type: ManuscritoDetailDto, description: 'Manuscrito importado com sucesso.' })
  uploadManuscrito(
    @Body() dto: UploadManuscritoDto,
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<ManuscritoDetailDto> {
    if (!file) {
      throw new BadRequestException('O campo "file" (arquivo) é obrigatório.');
    }
    return this.impService.importManuscrito(dto, user, file);
  }

  /**
   * GET /api/imp/manuscripts/:id
   * Detalhe de um manuscrito pelo id.
   */
  @Get('manuscripts/:id')
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
   */
  @Get('manuscripts/:id/estrutura')
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
   */
  @Get('projetos/:projetoId/manuscritos')
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
   */
  @Post('manuscripts/:id/segmentos/:segId/ignore')
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
   */
  @Delete('manuscripts/:id/segmentos/:segId/ignore')
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
   * POST /api/imp/manuscripts/:id/confirm-estrutura
   * Confirmar a estrutura de um manuscrito (avança o pipeline para Composição).
   * Retorna 200 OK (contrato api-contract.md §8.3) — não cria recurso novo, é um comando.
   */
  @Post('manuscripts/:id/confirm-estrutura')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirmar estrutura do manuscrito' })
  @ApiOkResponse({ description: 'Estrutura confirmada; manuscrito avançado para Composição.' })
  confirmEstrutura(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.impService.confirmEstrutura(id, user);
  }
}
