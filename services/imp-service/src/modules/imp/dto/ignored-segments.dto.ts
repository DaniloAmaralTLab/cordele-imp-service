import { ApiProperty } from '@nestjs/swagger';

/** DTO de resposta para a lista de segmentos ignorados de um manuscrito. */
export class IgnoredSegmentsDto {
  @ApiProperty({ description: 'ID do manuscrito' })
  manuscritoId!: string;

  @ApiProperty({
    description: 'IDs dos segmentos atualmente ignorados',
    type: [String],
  })
  ignoredSegmentoIds!: string[];
}
