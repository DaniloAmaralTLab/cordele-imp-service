import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

/** Payload de upload de manuscrito (multipart é tratado pelo interceptor; este DTO valida os campos de formulário). */
export class UploadManuscritoDto {
  @ApiProperty({ description: 'ID do projeto editorial ao qual o manuscrito pertence' })
  @IsUUID()
  @IsNotEmpty()
  projetoId!: string;

  @ApiProperty({ description: 'Nome original do arquivo', example: 'capitulos-finais.docx' })
  @IsString()
  @IsNotEmpty()
  filename!: string;
}
