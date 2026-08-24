import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiCreatedResponse,
  ApiTags,
} from '@nestjs/swagger';

import {
  CurrentUser,
  JwtAuthGuard,
  type AuthenticatedUser,
} from '../../infrastructure/auth/jwt-auth.guard';
import { ImpEntity } from '../../domain/imp.entity';
import { CreateImpDto } from './dto/create-imp.dto';
import { UpdateImpDto } from './dto/update-imp.dto';
import { ImpService } from './imp.service';

/**
 * HTTP adapter for the IMP (IMP) bounded context.
 *
 * Controllers stay thin: validate (via the global ValidationPipe + DTOs),
 * delegate to the application service, and shape the HTTP response. No
 * business rule lives here.
 */
@ApiTags('imp')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'imp', version: '1' })
export class ImpController {
  constructor(private readonly impService: ImpService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new imp record' })
  @ApiCreatedResponse({ description: 'The imp record was created.' })
  create(
    @Body() dto: CreateImpDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ImpEntity> {
    return this.impService.create(dto, user);
  }

  @Get()
  @ApiOperation({ summary: 'List imp records' })
  @ApiOkResponse({ description: 'Paginated imp records.' })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page = 1,
    @Query('size') size = 20,
  ): Promise<{ items: ImpEntity[]; total: number }> {
    return this.impService.findAll(user, { page: Number(page), size: Number(size) });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single imp record by id' })
  @ApiOkResponse({ description: 'The requested imp record.' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ImpEntity> {
    return this.impService.findOne(id, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Partially update a imp record' })
  @ApiOkResponse({ description: 'The updated imp record.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateImpDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ImpEntity> {
    return this.impService.update(id, dto, user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a imp record' })
  @ApiNoContentResponse({ description: 'The imp record was deleted.' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.impService.remove(id, user);
  }
}
