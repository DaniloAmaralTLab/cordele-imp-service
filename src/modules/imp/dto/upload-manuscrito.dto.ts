import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

/**
 * Campos de formulário do upload de manuscrito (multipart/form-data).
 *
 * Exatamente um de `projetoId` ou `projetoTitulo` deve ser fornecido:
 * - projetoId  → vincula ao projeto existente (validado pelo use case via FindProjetoPort)
 * - projetoTitulo → cria o ProjetoEditorial via PROJ port e vincula o manuscrito
 *
 * Ambos ausentes ou ambos presentes → 400 urn:cordele:imp:invalid-project-binding.
 * Validação da regra de negócio feita no use case (não no DTO, pois envolve lógica condicional).
 *
 * O campo `file` (binário) é recebido pelo FileInterceptor e não está neste DTO.
 */
export class UploadManuscritoDto {
  @ApiPropertyOptional({
    description: 'ID do projeto editorial existente (mutuamente exclusivo com projetoTitulo)',
    example: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380b22',
  })
  @IsOptional()
  @IsUUID()
  projetoId?: string;

  @ApiPropertyOptional({
    description: 'Título do projeto a criar em uma ação (mutuamente exclusivo com projetoId)',
    example: 'Meu Novo Livro',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  projetoTitulo?: string;
}
