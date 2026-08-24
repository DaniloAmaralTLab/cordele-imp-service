import { PartialType } from '@nestjs/swagger';

import { CreateImpDto } from './create-imp.dto';

/**
 * Partial update payload for IMP.
 *
 * `PartialType` (from @nestjs/swagger, not @nestjs/mapped-types) keeps every
 * class-validator rule of the create DTO but marks each field optional, and
 * carries the OpenAPI metadata over to the generated document.
 */
export class UpdateImpDto extends PartialType(CreateImpDto) {}
