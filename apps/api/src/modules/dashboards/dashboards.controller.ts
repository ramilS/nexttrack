import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { DashboardsService } from './dashboards.service';
import { WidgetDataService } from './widget-data.service';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { ApiEnvelope } from '@/common/decorators/api-envelope.decorator';
import {
  CreateDashboardDto,
  UpdateDashboardDto,
  AddWidgetDto,
  UpdateWidgetDto,
  DashboardDto,
  DashboardWidgetDto,
} from './dashboards.dto';

@Controller('dashboards')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DashboardsController {
  constructor(
    private dashboardsService: DashboardsService,
    private widgetDataService: WidgetDataService,
  ) {}

  @Get()
  @ApiEnvelope([DashboardDto])
  async findAll(@CurrentUser('id') userId: string) {
    return this.dashboardsService.findAll(userId);
  }

  @Get('default')
  @ApiEnvelope(DashboardDto)
  async getDefault(@CurrentUser('id') userId: string) {
    return this.dashboardsService.getOrCreateDefault(userId);
  }

  @Post()
  @ApiEnvelope(DashboardDto, { status: HttpStatus.CREATED })
  async create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateDashboardDto,
  ) {
    return this.dashboardsService.create(userId, dto);
  }

  @Get(':id')
  @ApiEnvelope(DashboardDto)
  async findOne(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.dashboardsService.findOne(userId, id);
  }

  @Patch(':id')
  @ApiEnvelope(DashboardDto)
  async update(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateDashboardDto,
  ) {
    return this.dashboardsService.update(userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    await this.dashboardsService.remove(userId, id);
  }

  @Post(':id/widgets')
  @ApiEnvelope(DashboardWidgetDto, { status: HttpStatus.CREATED })
  async addWidget(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: AddWidgetDto,
  ) {
    return this.dashboardsService.addWidget(userId, id, dto);
  }

  @Patch(':id/widgets/:widgetId')
  @ApiEnvelope(DashboardWidgetDto)
  async updateWidget(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Param('widgetId') widgetId: string,
    @Body() dto: UpdateWidgetDto,
  ) {
    return this.dashboardsService.updateWidget(userId, id, widgetId, dto);
  }

  @Delete(':id/widgets/:widgetId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeWidget(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Param('widgetId') widgetId: string,
  ) {
    await this.dashboardsService.removeWidget(userId, id, widgetId);
  }

  @Get(':id/widgets-data')
  async getAllWidgetData(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.widgetDataService.getAllWidgetData(userId, id);
  }

  @Get(':id/widgets/:widgetId/data')
  async getWidgetData(
    @CurrentUser('id') userId: string,
    @Param('widgetId') widgetId: string,
  ) {
    return this.widgetDataService.getWidgetData(userId, widgetId);
  }
}
