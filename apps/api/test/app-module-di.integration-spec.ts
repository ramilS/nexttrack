import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { AppModule } from '@/app.module';

/**
 * Compiles the real AppModule with zero provider overrides.
 *
 * Every other test harness (unit mocks, create-e2e-app processor overrides)
 * masks DI wiring errors — a missing module import surfaces only when the
 * built app boots. compile() validates the full dependency graph without
 * opening connections, so this catches UnknownDependenciesException cheaply.
 */
describe('AppModule dependency graph', () => {
  it('compiles without provider overrides and produces the OpenAPI document', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    expect(moduleRef).toBeDefined();

    // Render the OpenAPI document over the full route table — this walks
    // every ZodDto through nestjs-zod's JSON-schema converter, so an
    // OpenAPI-incompatible schema fails here instead of at /docs in prod.
    // No app.init(): document generation scans decorator metadata only,
    // and init() would open real MinIO/ES connections this harness lacks.
    const app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');

    const document = cleanupOpenApiDoc(
      SwaggerModule.createDocument(
        app,
        new DocumentBuilder().setTitle('NextTrack API').setVersion('1.0').build(),
      ),
    );

    const paths = Object.keys(document.paths);
    expect(paths.length).toBeGreaterThan(100);
    expect(paths).toContain('/api/projects/{key}/issues');
    const createIssue = document.paths['/api/projects/{key}/issues']?.post;
    expect(createIssue?.requestBody).toBeDefined();
    expect(Object.keys(document.components?.schemas ?? {}).length).toBeGreaterThan(50);

    // @ApiEnvelope documents the TransformInterceptor envelope: response
    // schemas must show { data, meta }, with data $ref-ing the DTO component.
    const listTags = document.paths['/api/projects/{key}/tags']?.get;
    const okResponse = listTags?.responses?.['200'] as {
      content?: Record<string, { schema?: Record<string, unknown> }>;
    };
    const envelope = okResponse?.content?.['application/json']?.schema as {
      properties?: { data?: { type?: string; items?: { $ref?: string } } };
      required?: string[];
    };
    expect(envelope?.required).toEqual(['data', 'meta']);
    expect(envelope?.properties?.data?.type).toBe('array');
    expect(envelope?.properties?.data?.items?.$ref).toBe(
      '#/components/schemas/TagDto',
    );
    expect(document.components?.schemas?.TagDto).toBeDefined();

    await moduleRef.close();
  });
});
