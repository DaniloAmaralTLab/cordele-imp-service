import { ApiProperty } from '@nestjs/swagger';

/**
 * Item de resposta do endpoint de lote `POST /api/imp/manuscripts/summaries`.
 *
 * Projetos sem manuscrito são omitidos do array — ausência no array significa
 * "sem manuscrito", diferente de zeros.
 */
export class ManuscritoSummaryItemDto {
  @ApiProperty({ description: 'ID do projeto' })
  projetoId!: string;

  @ApiProperty({ description: 'Total de capítulos no manuscrito mais recente' })
  totalCapitulos!: number;

  @ApiProperty({ description: 'Total de imagens no manuscrito mais recente' })
  totalImagens!: number;
}
