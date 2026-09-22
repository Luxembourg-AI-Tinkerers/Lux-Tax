import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import { HouseholdsService } from './households.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { HouseholdGuard } from '../../common/guards/household.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  createHouseholdSchema,
  inviteMemberSchema,
  acceptInvitationSchema,
} from '@luxtax/validation';
import {
  CreateHouseholdDto,
  InviteMemberDto,
  AcceptInvitationDto,
  HouseholdDto,
  InvitationDetailsDto,
} from '@luxtax/contracts';

@Controller('api/households')
export class HouseholdsController {
  constructor(private readonly householdsService: HouseholdsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async createHousehold(
    @CurrentUser('id') userId: string,
    @Body() body: CreateHouseholdDto
  ): Promise<HouseholdDto> {
    const parseResult = createHouseholdSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException(parseResult.error.errors[0]?.message || 'Validation failed');
    }
    return this.householdsService.createHousehold(userId, parseResult.data);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async getHouseholds(@CurrentUser('id') userId: string): Promise<readonly HouseholdDto[]> {
    return this.householdsService.getHouseholdsForUser(userId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, HouseholdGuard)
  async getHousehold(@Param('id', ParseUUIDPipe) id: string): Promise<HouseholdDto> {
    return this.householdsService.getHouseholdById(id);
  }

  @Post(':id/invitations')
  @UseGuards(JwtAuthGuard, HouseholdGuard)
  async inviteMember(
    @Param('id', ParseUUIDPipe) householdId: string,
    @CurrentUser('id') inviterId: string,
    @Body() body: InviteMemberDto
  ) {
    const parseResult = inviteMemberSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException(parseResult.error.errors[0]?.message || 'Validation failed');
    }
    return this.householdsService.inviteMember(householdId, inviterId, parseResult.data);
  }

  @Get('invitations/:token/details')
  async getInvitationDetails(@Param('token') token: string): Promise<InvitationDetailsDto> {
    return this.householdsService.getInvitationDetails(token);
  }

  @Post('invitations/accept')
  @UseGuards(JwtAuthGuard)
  async acceptInvitation(
    @CurrentUser('id') userId: string,
    @Body() body: AcceptInvitationDto
  ): Promise<HouseholdDto> {
    const parseResult = acceptInvitationSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException(parseResult.error.errors[0]?.message || 'Validation failed');
    }
    return this.householdsService.acceptInvitation(userId, parseResult.data.token);
  }
}
