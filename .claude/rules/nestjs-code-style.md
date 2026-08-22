# Code Style and Quality

## Principle: Write Code You'd Be Proud to Review

Every line of code should be intentional. If you wouldn't approve it in a code review — don't write it.

## Don't Take Shortcuts That Hide Problems

- **No `as any` to silence errors** — find the typed solution (see `nestjs-type-safety.md`)
- **No `// @ts-ignore` / `// @ts-expect-error`** — fix the type, not the symptom
- **No `eslint-disable` without a comment explaining why** — if you can't explain it, fix the code
- **No empty catch blocks** — at minimum log a warning (see `nestjs-async-safety.md`)
- **No TODO/FIXME without a ticket reference** — either fix it now or create an issue
- Do not leave not needed comments
- Do use unknown arg type - try to find proper type or suggest create DTO

## Prefer Explicit Over Implicit

- Import enum constants, don't rely on string literals matching enum values
- Use typed factory functions in tests, don't construct partial objects with `as any`
- Type controller inputs as `createZodDto` classes (validated by the global `AppZodValidationPipe`), don't trust runtime shapes
- Use typed config injection (`@Inject(config.KEY)`), don't use `ConfigService.get('STRING')`

## Consistency Over Cleverness

- If the codebase has a pattern for something (factories, accessors, decorators), follow it
- Don't invent a new way to do something that already has an established pattern
- Check `@test/helpers` before writing test utilities — it likely already exists

## When Generating Code

1. Read existing code in the same module first — match its patterns
2. Check if helpers/utilities already exist before creating new ones
3. Run `npx jest --no-coverage` after changes to verify nothing breaks
4. Ensure no `as any` is introduced that can be avoided with an existing pattern
