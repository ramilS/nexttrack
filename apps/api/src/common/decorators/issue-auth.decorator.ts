import { applyDecorators, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { PermissionGuard } from '@/common/guards/permission.guard';
import { IssueContextGuard } from '@/common/guards/issue-context.guard';

export function IssueAuth() {
  return applyDecorators(
    UseGuards(JwtAuthGuard, RolesGuard, IssueContextGuard, PermissionGuard),
  );
}
