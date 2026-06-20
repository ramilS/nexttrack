import {
  Controller,
  Get,
  Delete,
  Patch,
  Query,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';
import { NotificationsPreferencesService } from './notifications-preferences.service';
import {
  ApiEnvelope,
  ApiCursorPaginated,
} from '@/common/decorators/api-envelope.decorator';
import {
  MarkReadDto,
  NotificationQueryDto,
  UpdatePreferencesDto,
  NotificationPreferencesDto,
  NotificationItemDto,
  UnreadCountDto,
  NotificationChannelOptionDto,
} from './notifications.dto';
import { NOTIFICATION_TYPES_META } from './notification-types.meta';
import type {
  UnreadCount,
  NotificationChannelOption,
} from '@repo/shared/schemas';

@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotificationsController {
  constructor(
    private notificationsService: NotificationsService,
    private preferencesService: NotificationsPreferencesService,
  ) {}

  @Get()
  @ApiCursorPaginated(NotificationItemDto)
  findAll(
    @CurrentUser('id') userId: string,
    @Query() query: NotificationQueryDto,
  ) {
    return this.notificationsService.findAll(userId, query);
  }

  @Get('unread-count')
  @ApiEnvelope(UnreadCountDto)
  async getUnreadCount(
    @CurrentUser('id') userId: string,
  ): Promise<UnreadCount> {
    const count = await this.notificationsService.getUnreadCount(userId);
    return { count };
  }

  @Patch('read')
  markRead(
    @CurrentUser('id') userId: string,
    @Body() dto: MarkReadDto,
  ) {
    return this.notificationsService.markRead(userId, dto.notificationIds);
  }

  @Patch('read-all')
  markAllRead(@CurrentUser('id') userId: string) {
    return this.notificationsService.markAllRead(userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser('id') userId: string,
    @Param('id') notificationId: string,
  ) {
    return this.notificationsService.remove(userId, notificationId);
  }

  @Get('channel-options')
  @ApiEnvelope([NotificationChannelOptionDto])
  getChannelOptions(): NotificationChannelOption[] {
    return NOTIFICATION_TYPES_META;
  }

  @Get('preferences')
  @ApiEnvelope(NotificationPreferencesDto)
  getPreferences(@CurrentUser('id') userId: string) {
    return this.preferencesService.get(userId);
  }

  @Patch('preferences')
  @ApiEnvelope(NotificationPreferencesDto)
  updatePreferences(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdatePreferencesDto,
  ) {
    return this.preferencesService.update(userId, dto);
  }
}
