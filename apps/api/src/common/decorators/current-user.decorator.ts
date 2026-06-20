import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { GlobalRole } from '@prisma/client';

export interface RequestUser {
  id: string;
  email: string;
  name: string;
  role: GlobalRole;
  avatarUrl: string | null;
}

export const CurrentUser = createParamDecorator(
  (data: keyof RequestUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user: RequestUser = request.user;
    return data ? user?.[data] : user;
  },
);
