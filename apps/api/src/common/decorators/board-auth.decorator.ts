import { applyDecorators, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { PermissionGuard } from '@/common/guards/permission.guard';
import { BoardContextGuard } from '@/common/guards/board-context.guard';

export function BoardAuth() {
  return applyDecorators(
    UseGuards(JwtAuthGuard, RolesGuard, BoardContextGuard, PermissionGuard),
  );
}
