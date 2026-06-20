import { applyDecorators, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { PermissionGuard } from '@/common/guards/permission.guard';
import { ProjectContextInterceptor } from '@/common/interceptors/project-context.interceptor';

export function ProjectAuth() {
  return applyDecorators(
    UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard),
    UseInterceptors(ProjectContextInterceptor),
  );
}
