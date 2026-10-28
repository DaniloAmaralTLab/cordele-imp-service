import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { ContentTree } from '../../../domain/imp/content-tree';

/**
 * DTO de detalhe / resposta de upload de manuscrito.
 *
 * Mapeado a partir do agregado Manuscrito; nunca expõe o modelo Prisma diretamente.
 * Conforme api-contract.md §6.1 (ManuscritoDetail).
 *
 * D-A: parse síncrono → status sempre 'imported' na resposta de upload bem-sucedido.
 * D-B: sem parseJobId — não há polling.
 */
export class ManuscritoDetailDto {
  @ApiProperty({ description: 'Identificador único do manuscrito (UUID v4)' })
  id!: string;

  @ApiProperty({ description: 'ID do projeto editorial associado' })
  projetoId!: string;

  @ApiProperty({ description: 'Slug da empresa (multi-empresa)' })
  empresaId!: string;

  @ApiProperty({ description: 'Nome original do arquivo' })
  filename!: string;

  @ApiProperty({ description: 'MIME type do arquivo original' })
  mimeType!: string;

  @ApiProperty({
    description: 'Status do manuscrito',
    enum: ['imported', 'parsing', 'import_failed', 'PENDING_REVIEW', 'REVISAO_ESTRUTURA', 'IGNORADO', 'CONFIRMADO'],
  })
  status!: string;

  @ApiProperty({ description: 'Número total de capítulos na estrutura' })
  totalCapitulos!: number;

  @ApiProperty({ description: 'Número total de imagens na estrutura' })
  totalImagens!: number;

  @ApiProperty({ description: 'Número de trechos não parseados' })
  trechosNaoParseados!: number;

  @ApiPropertyOptional({ description: 'Estrutura canônica do manuscrito (ContentTree)' })
  estrutura?: ContentTree;

  @ApiProperty({ description: 'Data de criação' })
  createdAt!: Date;
}
