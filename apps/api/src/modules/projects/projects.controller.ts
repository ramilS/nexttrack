import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { GlobalRole, Project } from '@prisma/client';
import { ProjectsService } from './projects.service';
import { ProjectsMembersService } from './projects-members.service';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { PermissionGuard } from '@/common/guards/permission.guard';
import { ProjectContextInterceptor } from '@/common/interceptors/project-context.interceptor';
import { CurrentUser, RequestUser } from '@/common/decorators/current-user.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { Permission } from '@repo/shared';
import { ReqProject } from '@/common/decorators/project.decorator';
import { ApiEnvelope, ApiPaginated } from '@/common/decorators/api-envelope.decorator';
import {
  CreateProjectDto,
  UpdateProjectDto,
  ListProjectsQueryDto,
  AddMemberDto,
  UpdateMemberDto,
  MembersQueryDto,
  SearchMembersQueryDto,
  ProjectDto,
  ProjectDetailDto,
  ProjectMemberDto,
  UserSummaryDto,
} from './projects.dto';

@Controller('projects')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProjectsController {
  constructor(
    private projectsService: ProjectsService,
    private membersService: ProjectsMembersService,
  ) {}

  @Post()
  @Roles(GlobalRole.ADMIN)
  @ApiEnvelope(ProjectDetailDto, { status: HttpStatus.CREATED })
  async create(
    @Body() dto: CreateProjectDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.projectsService.create(dto, userId);
  }

  @Get()
  @ApiPaginated(ProjectDto)
  async findAll(
    @Query() query: ListProjectsQueryDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.projectsService.findAll(
      query,
      user.id,
      user.role === GlobalRole.ADMIN,
    );
  }

  @Get(':key')
  @UseInterceptors(ProjectContextInterceptor)
  @UseGuards(PermissionGuard)
  @RequirePermission(Permission.ISSUE_READ)
  @ApiEnvelope(ProjectDetailDto)
  async findOne(
    @Param('key') _key: string,
    @CurrentUser('id') userId: string,
    @ReqProject() project: Project,
  ) {
    return this.projectsService.findByKey(project.key, userId);
  }

  @Patch(':key')
  @UseInterceptors(ProjectContextInterceptor)
  @UseGuards(PermissionGuard)
  @RequirePermission(Permission.PROJECT_SETTINGS_UPDATE)
  @ApiEnvelope(ProjectDetailDto)
  async update(
    @ReqProject() project: Project,
    @Body() dto: UpdateProjectDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.projectsService.update(project, dto, userId);
  }

  @Post(':key/archive')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(ProjectContextInterceptor)
  @UseGuards(PermissionGuard)
  @RequirePermission(Permission.PROJECT_ARCHIVE)
  @ApiEnvelope(ProjectDetailDto)
  async archive(
    @ReqProject() project: Project,
    @CurrentUser('id') userId: string,
  ) {
    return this.projectsService.archive(project, userId);
  }

  @Post(':key/unarchive')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(ProjectContextInterceptor)
  @UseGuards(PermissionGuard)
  @RequirePermission(Permission.PROJECT_ARCHIVE)
  @ApiEnvelope(ProjectDetailDto)
  async unarchive(
    @ReqProject() project: Project,
    @CurrentUser('id') userId: string,
  ) {
    return this.projectsService.unarchive(project, userId);
  }

  @Delete(':key')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(GlobalRole.ADMIN)
  @UseInterceptors(ProjectContextInterceptor)
  async softDelete(
    @ReqProject() project: Project,
    @CurrentUser('id') userId: string,
  ) {
    await this.projectsService.softDelete(project, userId);
  }

  @Post(':key/restore')
  @HttpCode(HttpStatus.OK)
  @Roles(GlobalRole.ADMIN)
  @ApiEnvelope(ProjectDetailDto)
  async restore(
    @Param('key') key: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.projectsService.restore(key, userId);
  }

  // ─── Members ─────────────────────────────────────────────

  @Get(':key/members')
  @UseInterceptors(ProjectContextInterceptor)
  @UseGuards(PermissionGuard)
  @RequirePermission(Permission.ISSUE_READ)
  @ApiEnvelope([ProjectMemberDto])
  async getMembers(
    @ReqProject() project: Project,
    @Query() query: MembersQueryDto,
  ) {
    return this.membersService.findAll(project, query);
  }

  @Post(':key/members')
  @UseInterceptors(ProjectContextInterceptor)
  @UseGuards(PermissionGuard)
  @RequirePermission(Permission.MEMBER_MANAGE)
  @ApiEnvelope(ProjectMemberDto, { status: HttpStatus.CREATED })
  async addMember(
    @ReqProject() project: Project,
    @Body() dto: AddMemberDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.membersService.addMember(project, dto, userId);
  }

  @Patch(':key/members/:userId')
  @UseInterceptors(ProjectContextInterceptor)
  @UseGuards(PermissionGuard)
  @RequirePermission(Permission.MEMBER_MANAGE)
  @ApiEnvelope(ProjectMemberDto)
  async updateMemberRole(
    @ReqProject() project: Project,
    @Param('userId') userId: string,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.membersService.updateRole(project, userId, dto);
  }

  @Delete(':key/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseInterceptors(ProjectContextInterceptor)
  @UseGuards(PermissionGuard)
  @RequirePermission(Permission.MEMBER_MANAGE)
  async removeMember(
    @ReqProject() project: Project,
    @Param('userId') userId: string,
  ) {
    await this.membersService.removeMember(project, userId);
  }

  @Get(':key/members/search')
  @UseInterceptors(ProjectContextInterceptor)
  @UseGuards(PermissionGuard)
  @RequirePermission(Permission.ISSUE_READ)
  @ApiEnvelope([UserSummaryDto])
  async searchMembers(
    @ReqProject() project: Project,
    @Query() query: SearchMembersQueryDto,
  ) {
    return this.membersService.searchMembers(project, query.q);
  }

  @Get(':key/members/addable')
  @UseInterceptors(ProjectContextInterceptor)
  @UseGuards(PermissionGuard)
  @RequirePermission(Permission.MEMBER_MANAGE)
  @ApiEnvelope([UserSummaryDto])
  async searchAddableUsers(
    @ReqProject() project: Project,
    @Query() query: SearchMembersQueryDto,
  ) {
    return this.membersService.searchAddableUsers(project, query.q);
  }
}
