import { ApiProperty } from '@nestjs/swagger';

/** DTO de detalhe de manuscrito retornado pela API — nunca expõe o modelo Prisma diretamente. */
export class ManuscritoDetailDto {
  @ApiProperty({ description: 'Identificador único do manuscrito' })
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
    enum: ['PENDING_REVIEW', 'REVISAO_ESTRUTURA', 'IGNORADO', 'CONFIRMADO'],
  })
  status!: string;

  @ApiProperty({ description: 'Data de criação' })
  createdAt!: Date;
}
