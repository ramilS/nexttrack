import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { ApiEnvelope, ApiPaginated } from '@/common/decorators/api-envelope.decorator';
import {
  UpdateUserDto,
  AdminUpdateUserDto,
  ChangePasswordDto,
  SendInviteDto,
  BlockUserDto,
  ListUsersQueryDto,
  ListInvitesQueryDto,
  UserDto,
  CurrentUserDto,
  InviteDto,
  UserMembershipDto,
} from './users.dto';
import { GlobalRole } from '@prisma/client';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  // --- Current User ---

  @Get('me')
  @ApiEnvelope(CurrentUserDto)
  getMe(@CurrentUser('id') userId: string) {
    return this.usersService.getMe(userId);
  }

  @Patch('me')
  @ApiEnvelope(CurrentUserDto)
  updateMe(@CurrentUser('id') userId: string, @Body() dto: UpdateUserDto) {
    return this.usersService.updateMe(userId, dto);
  }

  @Patch('me/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  changePassword(
    @CurrentUser('id') userId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.usersService.changePassword(userId, dto);
  }

  // --- Admin: User Management ---

  @Get()
  @Roles(GlobalRole.ADMIN)
  @ApiPaginated(UserDto)
  findAll(@Query() query: ListUsersQueryDto) {
    return this.usersService.findAll(query);
  }

  @Get('invites')
  @Roles(GlobalRole.ADMIN)
  @ApiEnvelope([InviteDto])
  findInvites(@Query() query: ListInvitesQueryDto) {
    return this.usersService.findInvites(query);
  }

  @Get(':id')
  @Roles(GlobalRole.ADMIN)
  @ApiEnvelope(UserDto)
  findById(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Get(':id/memberships')
  @Roles(GlobalRole.ADMIN)
  @ApiEnvelope([UserMembershipDto])
  getUserMemberships(@Param('id') id: string) {
    return this.usersService.getUserMemberships(id);
  }

  @Patch(':id')
  @Roles(GlobalRole.ADMIN)
  @ApiEnvelope(UserDto)
  adminUpdateUser(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: AdminUpdateUserDto,
  ) {
    return this.usersService.adminUpdateUser(id, adminId, dto);
  }

  // --- Admin: Invites ---

  @Post('invite')
  @Roles(GlobalRole.ADMIN)
  @ApiEnvelope(InviteDto, { status: HttpStatus.CREATED })
  sendInvite(@CurrentUser('id') senderId: string, @Body() dto: SendInviteDto) {
    return this.usersService.sendInvite(senderId, dto);
  }

  @Post('invite/:inviteId/resend')
  @HttpCode(HttpStatus.OK)
  @Roles(GlobalRole.ADMIN)
  @ApiEnvelope(InviteDto)
  resendInvite(
    @Param('inviteId') inviteId: string,
    @CurrentUser('id') senderId: string,
  ) {
    return this.usersService.resendInvite(inviteId, senderId);
  }

  @Delete('invite/:inviteId')
  @Roles(GlobalRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  revokeInvite(@Param('inviteId') inviteId: string) {
    return this.usersService.revokeInvite(inviteId);
  }

  // --- Admin: Block / Unblock ---

  @Patch(':id/block')
  @Roles(GlobalRole.ADMIN)
  @ApiEnvelope(UserDto)
  blockUser(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: BlockUserDto,
  ) {
    return this.usersService.blockUser(id, adminId, dto);
  }

  @Patch(':id/unblock')
  @Roles(GlobalRole.ADMIN)
  @ApiEnvelope(UserDto)
  unblockUser(@Param('id') id: string) {
    return this.usersService.unblockUser(id);
  }

  // --- Admin: Soft Delete / Restore ---

  @Delete(':id')
  @Roles(GlobalRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteUser(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
  ) {
    return this.usersService.softDeleteUser(id, adminId);
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  @Roles(GlobalRole.ADMIN)
  @ApiEnvelope(UserDto)
  restoreUser(@Param('id') id: string) {
    return this.usersService.restoreUser(id);
  }
}
