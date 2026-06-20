import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const ReqProject = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    return ctx.switchToHttp().getRequest().project;
  },
);
