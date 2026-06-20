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
} from '@nestjs/common';
import { Project } from '@prisma/client';
import { TeamsService } from './teams.service';
import { ProjectAuth } from '@/common/decorators/project-auth.decorator';
import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { Permission } from '@repo/shared';
import { ReqProject } from '@/common/decorators/project.decorator';
import { ApiEnvelope } from '@/common/decorators/api-envelope.decorator';
import {
  CreateTeamDto,
  UpdateTeamDto,
  AddTeamMembersDto,
  TeamDto,
} from './teams.dto';

@Controller('projects/:key/teams')
@ProjectAuth()
export class TeamsController {
  constructor(private teamsService: TeamsService) {}

  @Get()
  @RequirePermission(Permission.ISSUE_READ)
  @ApiEnvelope([TeamDto])
  async findAll(@ReqProject() project: Project) {
    return this.teamsService.findAll(project.id);
  }

  @Post()
  @RequirePermission(Permission.TEAM_MANAGE)
  @ApiEnvelope(TeamDto, { status: HttpStatus.CREATED })
  async create(
    @ReqProject() project: Project,
    @Body() dto: CreateTeamDto,
  ) {
    return this.teamsService.create(project.id, dto);
  }

  @Get(':teamId')
  @RequirePermission(Permission.ISSUE_READ)
  @ApiEnvelope(TeamDto)
  async findOne(
    @ReqProject() project: Project,
    @Param('teamId') teamId: string,
  ) {
    return this.teamsService.findOne(project.id, teamId);
  }

  @Patch(':teamId')
  @RequirePermission(Permission.TEAM_MANAGE)
  @ApiEnvelope(TeamDto)
  async update(
    @ReqProject() project: Project,
    @Param('teamId') teamId: string,
    @Body() dto: UpdateTeamDto,
  ) {
    return this.teamsService.update(project.id, teamId, dto);
  }

  @Delete(':teamId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(Permission.TEAM_MANAGE)
  async remove(
    @ReqProject() project: Project,
    @Param('teamId') teamId: string,
  ) {
    await this.teamsService.remove(project.id, teamId);
  }

  @Post(':teamId/members')
  @RequirePermission(Permission.TEAM_MANAGE)
  @ApiEnvelope(TeamDto, { status: HttpStatus.CREATED })
  async addMembers(
    @ReqProject() project: Project,
    @Param('teamId') teamId: string,
    @Body() dto: AddTeamMembersDto,
  ) {
    return this.teamsService.addMembers(project.id, teamId, dto);
  }

  @Delete(':teamId/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(Permission.TEAM_MANAGE)
  async removeMember(
    @ReqProject() project: Project,
    @Param('teamId') teamId: string,
    @Param('userId') userId: string,
  ) {
    await this.teamsService.removeMember(project.id, teamId, userId);
  }
}
