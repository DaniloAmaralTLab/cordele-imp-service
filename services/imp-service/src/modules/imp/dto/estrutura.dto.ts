import { ApiProperty } from '@nestjs/swagger';

/** DTO para retorno da estrutura (ContentTree) de um manuscrito. */
export class EstruturaDto {
  @ApiProperty({ description: 'ID do manuscrito' })
  manuscritoId!: string;

  @ApiProperty({
    description: 'Estrutura canônica do manuscrito em JSON (capítulos → seções → blocos)',
    type: 'object',
    additionalProperties: true,
  })
  estrutura!: Record<string, unknown>;
}
