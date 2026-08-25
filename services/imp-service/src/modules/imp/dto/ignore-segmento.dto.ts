import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Payload para ignorar ou restaurar um segmento de curadoria. */
export class IgnoreSegmentoDto {
  @ApiPropertyOptional({
    description: 'Motivo do ignore (opcional, para auditoria)',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  motivo?: string;
}
