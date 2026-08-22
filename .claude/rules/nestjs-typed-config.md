# NestJS Typed Config Pattern

Always use type-safe configuration with `registerAs` + Zod validation instead of `ConfigService.get('STRING')`.

## Pattern

1. Define config with Zod schema in `apps/api/src/config/<name>.config.ts`:

```typescript
import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const schema = z.object({
  myValue: z.string(),
});

export type MyConfig = z.infer<typeof schema>;

export const myConfig = registerAs('my', (): MyConfig => {
  return schema.parse({
    myValue: process.env.MY_VALUE,
  });
});
```

2. Re-export from `apps/api/src/config/index.ts`

3. Register in `AppModule` ConfigModule.forRoot `load` array

4. Inject in services/controllers:

```typescript
import { myConfig } from '../../config';

constructor(
  @Inject(myConfig.KEY)
  private my: ConfigType<typeof myConfig>,
) {}
```

## Rules

- NEVER use `ConfigService.get('STRING')` or `ConfigService.getOrThrow('STRING')`
- ALWAYS use `@Inject(config.KEY)` with `ConfigType<typeof config>`
- All env vars MUST be validated through Zod schemas
- Each config domain gets its own file (app, auth, database, redis, mail, sso, etc.)
