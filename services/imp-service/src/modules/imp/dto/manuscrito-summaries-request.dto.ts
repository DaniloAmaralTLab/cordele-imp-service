import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsUUID } from 'class-validator';

/**
 * Request body para o endpoint de lote `POST /api/imp/manuscripts/summaries`.
 *
 * Consumido pelo proj-service para popular cards da biblioteca de projetos.
 *
 * Limit: máx 50 itens por requisição (padronizado cross-módulo).
 * Exceder retorna 400 com `type: urn:cordele:imp:validation`.
 */
export class ManuscritoSummariesRequestDto {
  @ApiProperty({
    type: [String],
    description: 'Lista de projetoIds para consulta em lote (máx 50)',
    example: ['550e8400-e29b-41d4-a716-446655440000'],
    maxItems: 50,
  })
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMaxSize(50)
  projetoIds!: string[];
}
