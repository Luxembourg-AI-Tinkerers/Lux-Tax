import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
  BadRequestException,
  Req,
} from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { HouseholdGuard } from '../../common/guards/household.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { uploadDocumentSchema } from '@luxtax/validation';
import { DocumentDto, DocumentVisibility } from '@luxtax/contracts';
import { FastifyRequest } from 'fastify';

@Controller('api/workspaces/:workspaceId/documents')
@UseGuards(JwtAuthGuard, HouseholdGuard)
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post()
  async upload(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentUser('id') userId: string,
    @Body() body: any,
    @Req() req: FastifyRequest,
  ): Promise<DocumentDto> {
    const parseResult = uploadDocumentSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException(parseResult.error.errors[0]?.message || 'Validation failed');
    }
    return this.documentsService.uploadDocument(
      workspaceId,
      userId,
      parseResult.data,
      req.ip,
    );
  }

  @Get()
  async getDocuments(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentUser('id') userId: string,
  ): Promise<DocumentDto[]> {
    return this.documentsService.getDocumentsForWorkspace(workspaceId, userId);
  }

  @Patch(':documentId/visibility')
  async updateVisibility(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @CurrentUser('id') userId: string,
    @Body('visibility') visibility: DocumentVisibility,
    @Req() req: FastifyRequest,
  ): Promise<DocumentDto> {
    if (!Object.values(DocumentVisibility).includes(visibility)) {
      throw new BadRequestException('Invalid visibility state');
    }
    return this.documentsService.updateVisibility(
      workspaceId,
      documentId,
      userId,
      visibility,
      req.ip,
    );
  }

  @Delete(':documentId')
  async delete(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @CurrentUser('id') userId: string,
    @Req() req: FastifyRequest,
  ): Promise<{ success: boolean }> {
    await this.documentsService.deleteDocument(workspaceId, documentId, userId, req.ip);
    return { success: true };
  }
}
