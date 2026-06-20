import { extractAccessTokenFromCookies } from '@test/support/auth-helper';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import {
  E2eContext,
  createE2eApp,
  teardownE2eApp,
  truncateTables,
  seedSystemRoles,
} from './support/create-e2e-app';

describe('Custom Fields Integration', () => {
  let ctx: E2eContext;
  let adminToken: string;
  let projectKey: string;
  let issueId: string;

  beforeAll(async () => {
    ctx = await createE2eApp();
  }, 60_000);

  afterAll(async () => {
    await teardownE2eApp(ctx);
  });

  beforeEach(async () => {
    await truncateTables(ctx.prisma);
    await seedSystemRoles(ctx.prisma);

    const hash = await bcrypt.hash('adminpass1', 4);
    await ctx.prisma.user.create({
      data: {
        email: 'admin@test.local',
        name: 'Admin User',
        passwordHash: hash,
        hasPassword: true,
        role: 'ADMIN',
      },
    });

    const loginRes = await request(ctx.app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@test.local', password: 'adminpass1' })
      .expect(200);
    adminToken = extractAccessTokenFromCookies(loginRes.headers["set-cookie"]);

    projectKey = 'CF';
    await authReq()
      .post('/projects')
      .send({ key: projectKey, name: 'Custom Fields Project' })
      .expect(201);

    const issueRes = await authReq()
      .post(`/projects/${projectKey}/issues`)
      .send({ title: 'Test Issue', type: 'TASK' })
      .expect(201);
    issueId = issueRes.body.data.id;
  });

  function authReq() {
    return {
      get: (url: string) =>
        request(ctx.app.getHttpServer())
          .get(url)
          .set('Authorization', `Bearer ${adminToken}`),
      post: (url: string) =>
        request(ctx.app.getHttpServer())
          .post(url)
          .set('Authorization', `Bearer ${adminToken}`),
      patch: (url: string) =>
        request(ctx.app.getHttpServer())
          .patch(url)
          .set('Authorization', `Bearer ${adminToken}`),
      put: (url: string) =>
        request(ctx.app.getHttpServer())
          .put(url)
          .set('Authorization', `Bearer ${adminToken}`),
      delete: (url: string) =>
        request(ctx.app.getHttpServer())
          .delete(url)
          .set('Authorization', `Bearer ${adminToken}`),
    };
  }

  function fieldsUrl(fieldId?: string) {
    const base = `/projects/${projectKey}/custom-fields`;
    return fieldId ? `${base}/${fieldId}` : base;
  }

  async function createTextField(name: string) {
    const res = await authReq()
      .post(fieldsUrl())
      .send({
        name,
        type: 'TEXT',
        config: { type: 'TEXT' },
      })
      .expect(201);
    return res.body.data;
  }

  async function createEnumField(name: string, options: string[]) {
    const res = await authReq()
      .post(fieldsUrl())
      .send({
        name,
        type: 'ENUM',
        config: {
          type: 'ENUM',
          options: options.map((o) => ({ name: o, color: '#FF0000' })),
        },
      })
      .expect(201);
    return res.body.data;
  }

  // ─── CRUD ───────────────────────────────────────────────────

  describe('Field CRUD', () => {
    it('should create a TEXT custom field', async () => {
      const field = await createTextField('Notes');

      expect(field.name).toBe('Notes');
      expect(field.type).toBe('TEXT');
      expect(field.ordinal).toBe(0);
    });

    it('should create an ENUM field with options', async () => {
      const field = await createEnumField('Priority Level', ['P0', 'P1', 'P2']);

      expect(field.type).toBe('ENUM');
      expect(field.config.options).toHaveLength(3);
      expect(field.config.options[0].name).toBe('P0');
      expect(field.config.options[0].id).toBeTruthy();
    });

    it('should list all fields for a project', async () => {
      await createTextField('Field A');
      await createTextField('Field B');

      const res = await authReq().get(fieldsUrl()).expect(200);

      expect(res.body.data).toHaveLength(2);
    });

    it('should update a field name', async () => {
      const field = await createTextField('Old Name');

      const res = await authReq()
        .patch(fieldsUrl(field.id))
        .send({ name: 'New Name' })
        .expect(200);

      expect(res.body.data.name).toBe('New Name');
    });

    it('should soft-delete a field', async () => {
      const field = await createTextField('Doomed');

      await authReq().delete(fieldsUrl(field.id)).expect(204);

      // Should not appear in list
      const listRes = await authReq().get(fieldsUrl()).expect(200);
      expect(listRes.body.data).toHaveLength(0);
    });

    it('should assign ascending ordinals', async () => {
      const f1 = await createTextField('First');
      const f2 = await createTextField('Second');

      expect(f1.ordinal).toBe(0);
      expect(f2.ordinal).toBe(1);
    });

    it('should reorder fields', async () => {
      const f1 = await createTextField('A');
      const f2 = await createTextField('B');

      await authReq()
        .put(fieldsUrl() + '/reorder')
        .send({
          ordinals: [
            { id: f1.id, ordinal: 1 },
            { id: f2.id, ordinal: 0 },
          ],
        })
        .expect(200);

      const listRes = await authReq().get(fieldsUrl()).expect(200);
      expect(listRes.body.data[0].name).toBe('B');
      expect(listRes.body.data[1].name).toBe('A');
    });
  });

  // ─── Enum Options ──────────────────────────────────────────

  describe('Enum option management', () => {
    it('should add a new option to an ENUM field', async () => {
      const field = await createEnumField('Status', ['Open', 'Closed']);

      const res = await authReq()
        .post(fieldsUrl(field.id) + '/options')
        .send({ name: 'In Progress', color: '#00FF00' })
        .expect(201);

      expect(res.body.data.config.options).toHaveLength(3);
    });

    it('should update an enum option', async () => {
      const field = await createEnumField('Env', ['Dev', 'Prod']);
      const optionId = field.config.options[0].id;

      const res = await authReq()
        .patch(fieldsUrl(field.id) + `/options/${optionId}`)
        .send({ name: 'Development', color: '#0000FF' })
        .expect(200);

      const updated = res.body.data.config.options.find(
        (o: { id: string }) => o.id === optionId,
      );
      expect(updated.name).toBe('Development');
    });

    it('should reject deleting enum option in use without force', async () => {
      const field = await createEnumField('Category', ['Bug', 'Feature']);
      const optionId = field.config.options[0].id;

      // Set value on issue
      await authReq()
        .patch(`/issues/${issueId}/fields/${field.id}`)
        .send({ value: optionId })
        .expect(200);

      // Try to delete without force
      const res = await authReq()
        .delete(fieldsUrl(field.id) + `/options/${optionId}`)
        .expect(409);

      expect(res.body.error.code).toBeTruthy();
    });

    it('should force-delete enum option and cascade values', async () => {
      const field = await createEnumField('Severity', ['Low', 'High']);
      const optionId = field.config.options[0].id;

      // Set value on issue
      await authReq()
        .patch(`/issues/${issueId}/fields/${field.id}`)
        .send({ value: optionId })
        .expect(200);

      // Force delete
      await authReq()
        .delete(fieldsUrl(field.id) + `/options/${optionId}?force=true`)
        .expect(204);

      // Value should be cleared
      const valuesRes = await authReq()
        .get(`/issues/${issueId}/fields`)
        .expect(200);

      const fieldValue = valuesRes.body.data.find((f: { fieldId: string }) => f.fieldId === field.id);
      expect(fieldValue.value).toBeNull();
    });

    it('should reorder enum options', async () => {
      const field = await createEnumField('Prio', ['A', 'B', 'C']);
      const opts = field.config.options;

      await authReq()
        .put(fieldsUrl(field.id) + '/options/reorder')
        .send({
          ordinals: [
            { id: opts[2].id, ordinal: 0 },
            { id: opts[0].id, ordinal: 1 },
            { id: opts[1].id, ordinal: 2 },
          ],
        })
        .expect(200);
    });
  });

  // ─── Field Values ──────────────────────────────────────────

  describe('Field values', () => {
    it('should set and get a TEXT field value', async () => {
      const field = await createTextField('Notes');

      await authReq()
        .patch(`/issues/${issueId}/fields/${field.id}`)
        .send({ value: 'Hello world' })
        .expect(200);

      const res = await authReq()
        .get(`/issues/${issueId}/fields`)
        .expect(200);

      const fieldValue = res.body.data.find((f: { fieldId: string }) => f.fieldId === field.id);
      expect(fieldValue.value).toBe('Hello world');
    });

    it('should set an ENUM field value', async () => {
      const field = await createEnumField('Type', ['Bug', 'Feature']);
      const optionId = field.config.options[1].id;

      await authReq()
        .patch(`/issues/${issueId}/fields/${field.id}`)
        .send({ value: optionId })
        .expect(200);

      const res = await authReq()
        .get(`/issues/${issueId}/fields`)
        .expect(200);

      const fieldValue = res.body.data.find((f: { fieldId: string }) => f.fieldId === field.id);
      expect(fieldValue.value).toBe(optionId);
    });

    it('should clear a non-required field value', async () => {
      const field = await createTextField('Optional');

      await authReq()
        .patch(`/issues/${issueId}/fields/${field.id}`)
        .send({ value: 'something' })
        .expect(200);

      await authReq()
        .delete(`/issues/${issueId}/fields/${field.id}`)
        .expect(204);

      const res = await authReq()
        .get(`/issues/${issueId}/fields`)
        .expect(200);

      const fieldValue = res.body.data.find((f: { fieldId: string }) => f.fieldId === field.id);
      expect(fieldValue.value).toBeNull();
    });

    it('should create a NUMBER field and validate bounds', async () => {
      const res = await authReq()
        .post(fieldsUrl())
        .send({
          name: 'Story Points',
          type: 'NUMBER',
          config: { type: 'NUMBER', min: 0, max: 100 },
        })
        .expect(201);
      const field = res.body.data;

      // Valid value
      await authReq()
        .patch(`/issues/${issueId}/fields/${field.id}`)
        .send({ value: 42 })
        .expect(200);

      // Out of bounds
      await authReq()
        .patch(`/issues/${issueId}/fields/${field.id}`)
        .send({ value: 999 })
        .expect(400);
    });

    it('should reject invalid ENUM option value', async () => {
      const field = await createEnumField('Category', ['A', 'B']);

      await authReq()
        .patch(`/issues/${issueId}/fields/${field.id}`)
        .send({ value: '00000000-0000-0000-0000-000000000000' })
        .expect(400);
    });

    it('should create a URL field and validate format', async () => {
      const res = await authReq()
        .post(fieldsUrl())
        .send({
          name: 'Docs Link',
          type: 'URL',
          config: { type: 'URL' },
        })
        .expect(201);
      const field = res.body.data;

      // Valid URL
      await authReq()
        .patch(`/issues/${issueId}/fields/${field.id}`)
        .send({ value: 'https://example.com' })
        .expect(200);

      // Invalid URL
      await authReq()
        .patch(`/issues/${issueId}/fields/${field.id}`)
        .send({ value: 'not-a-url' })
        .expect(400);
    });
  });
});
