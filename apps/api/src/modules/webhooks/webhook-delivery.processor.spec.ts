import * as crypto from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigType } from '@nestjs/config';
import { Job } from 'bullmq';
import { OutboxStatus } from '@prisma/client';
import { mockSsoConfig } from '@test/helpers';
import { webhookConfig } from '@/config';
import { EncryptionService } from '@/common/services/encryption.service';
import { OutboxPollerProcessor } from '@/modules/outbox/outbox-poller.processor';
import { OutboxEventAttempts } from '@/modules/outbox/outbox.repository';
import { WebhookDeliveryProcessor } from './webhook-delivery.processor';
import {
  WebhooksRepository,
  WebhookDeliveryContextRow,
  WebhookRow,
} from './webhooks.repository';
import {
  WebhookUrlError,
  assertResolvedAddressIsPublic,
  validateWebhookUrlSync,
} from './url-validator';

jest.mock('./url-validator', () => {
  const actual = jest.requireActual<typeof import('./url-validator')>(
    './url-validator',
  );
  return {
    ...actual,
    validateWebhookUrlSync: jest.fn(),
    assertResolvedAddressIsPublic: jest.fn(),
  };
});

const mockedValidateSync = jest.mocked(validateWebhookUrlSync);
const mockedAssertPublic = jest.mocked(assertResolvedAddressIsPublic);

const SECRET = 'supersecretkey1234567890abcdef12';
const WEBHOOK_ID = 'wh-1';
const OUTBOX_ID = 'outbox-1';
const EVENT_TYPE = 'ISSUE_CREATED';
const TARGET_URL = 'https://example.com/hook';

const buildDeliveryContext = (
  overrides: Partial<WebhookDeliveryContextRow> = {},
): WebhookDeliveryContextRow => ({
  secret: SECRET,
  url: TARGET_URL,
  isEnabled: true,
  name: 'My Webhook',
  ...overrides,
});

const buildWebhookRow = (overrides: Partial<WebhookRow> = {}): WebhookRow => ({
  id: WEBHOOK_ID,
  projectId: 'proj-1',
  createdById: 'user-1',
  name: 'My Webhook',
  url: TARGET_URL,
  secret: SECRET,
  eventTypes: [EVENT_TYPE],
  isEnabled: true,
  disabledAt: null,
  disabledReason: null,
  consecutiveFailures: 0,
  lastDeliveryAt: null,
  lastStatusCode: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
});

const buildOutboxAttempts = (
  overrides: Partial<OutboxEventAttempts> = {},
): OutboxEventAttempts => ({
  id: OUTBOX_ID,
  attempts: 0,
  maxAttempts: 5,
  status: OutboxStatus.PROCESSING,
  ...overrides,
});

const buildJob = (data: Record<string, unknown> = {}): Job =>
  ({
    data: {
      outboxEventId: OUTBOX_ID,
      webhookId: WEBHOOK_ID,
      eventType: EVENT_TYPE,
      data: { foo: 'bar' },
      ...data,
    },
  }) as Job;

interface MockResponseOptions {
  status?: number;
  ok?: boolean;
  statusText?: string;
  body?: BodyInit | null;
}

const buildResponse = (opts: MockResponseOptions = {}): Response => {
  const status = opts.status ?? 200;
  return new Response(opts.body ?? null, {
    status,
    statusText: opts.statusText ?? '',
  });
};

type RepoMock = jest.Mocked<
  Pick<
    WebhooksRepository,
    'findDeliveryContext' | 'findById' | 'update' | 'createDeliveryLog'
  >
>;

type PollerMock = jest.Mocked<
  Pick<
    OutboxPollerProcessor,
    'markProcessed' | 'markFailed' | 'findEventById'
  >
>;

describe('WebhookDeliveryProcessor', () => {
  let processor: WebhookDeliveryProcessor;
  let repo: RepoMock;
  let poller: PollerMock;
  let encryption: EncryptionService;
  let fetchMock: jest.SpyInstance;

  const config: ConfigType<typeof webhookConfig> = {
    timeoutMs: 10000,
    maxConsecutiveFailures: 3,
    allowPrivateUrls: false,
    maxResponseBytes: 64 * 1024,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockedValidateSync.mockReturnValue(new URL(TARGET_URL));
    mockedAssertPublic.mockResolvedValue('203.0.113.10');

    repo = {
      findDeliveryContext: jest.fn().mockResolvedValue(buildDeliveryContext()),
      findById: jest.fn().mockResolvedValue(buildWebhookRow()),
      update: jest.fn().mockResolvedValue(buildWebhookRow()),
      createDeliveryLog: jest.fn().mockResolvedValue(undefined),
    };

    poller = {
      markProcessed: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
      findEventById: jest.fn().mockResolvedValue(buildOutboxAttempts()),
    };

    encryption = new EncryptionService(mockSsoConfig);
    jest
      .spyOn(encryption['logger'], 'warn')
      .mockImplementation(() => undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookDeliveryProcessor,
        { provide: WebhooksRepository, useValue: repo },
        { provide: OutboxPollerProcessor, useValue: poller },
        { provide: webhookConfig.KEY, useValue: config },
        { provide: EncryptionService, useValue: encryption },
      ],
    }).compile();

    processor = module.get(WebhookDeliveryProcessor);

    fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(buildResponse({ status: 200 }));

    // Silence logger noise.
    jest.spyOn(processor['logger'], 'log').mockImplementation(() => undefined);
    jest.spyOn(processor['logger'], 'warn').mockImplementation(() => undefined);
    jest.spyOn(processor['logger'], 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  describe('HMAC signature', () => {
    it('signs HMAC-SHA256 over `${timestamp}.${body}` with the live secret', async () => {
      await processor.process(buildJob());

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      const timestamp = headers['X-Timestamp'];
      const body = init.body as string;

      const expected = crypto
        .createHmac('sha256', SECRET)
        .update(`${timestamp}.${body}`)
        .digest('hex');

      expect(headers['X-Signature']).toBe(`sha256=${expected}`);
    });

    it('uses the secret fetched from the repository, not from the job payload', async () => {
      const dbSecret = 'db-secret-value-from-repository-xyz';
      repo.findDeliveryContext.mockResolvedValue(
        buildDeliveryContext({ secret: dbSecret }),
      );

      // Job carries a different (attacker-controllable) secret which must be ignored.
      await processor.process(buildJob({ secret: 'job-payload-secret' }));

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      const body = init.body as string;
      const timestamp = headers['X-Timestamp'];

      const expectedWithDbSecret = crypto
        .createHmac('sha256', dbSecret)
        .update(`${timestamp}.${body}`)
        .digest('hex');

      expect(headers['X-Signature']).toBe(`sha256=${expectedWithDbSecret}`);
    });

    it('decrypts an encrypted stored secret before signing', async () => {
      repo.findDeliveryContext.mockResolvedValue(
        buildDeliveryContext({ secret: encryption.encrypt(SECRET) }),
      );

      await processor.process(buildJob());

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      const body = init.body as string;

      const expected = crypto
        .createHmac('sha256', SECRET)
        .update(`${headers['X-Timestamp']}.${body}`)
        .digest('hex');

      expect(headers['X-Signature']).toBe(`sha256=${expected}`);
    });

    it('falls back to a legacy plaintext secret and warns', async () => {
      const warnSpy = jest.spyOn(encryption['logger'], 'warn');
      repo.findDeliveryContext.mockResolvedValue(
        buildDeliveryContext({ secret: SECRET }),
      );

      await processor.process(buildJob());

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      const body = init.body as string;

      const expected = crypto
        .createHmac('sha256', SECRET)
        .update(`${headers['X-Timestamp']}.${body}`)
        .digest('hex');

      expect(headers['X-Signature']).toBe(`sha256=${expected}`);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Legacy plaintext secret'),
      );
    });

    it('sends delivery metadata headers', async () => {
      await processor.process(buildJob());

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;

      expect(url).toBe(TARGET_URL);
      expect(init.method).toBe('POST');
      expect(init.redirect).toBe('manual');
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['X-Event-Type']).toBe(EVENT_TYPE);
      expect(headers['X-Delivery-Id']).toBe(OUTBOX_ID);
      expect(headers['X-Timestamp']).toEqual(expect.any(String));
    });
  });

  describe('missing / disabled webhook', () => {
    it('marks processed and skips delivery when webhook not found', async () => {
      repo.findDeliveryContext.mockResolvedValue(null);

      await processor.process(buildJob());

      expect(poller.markProcessed).toHaveBeenCalledWith(OUTBOX_ID);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('marks processed and skips delivery when webhook disabled', async () => {
      repo.findDeliveryContext.mockResolvedValue(
        buildDeliveryContext({ isEnabled: false }),
      );

      await processor.process(buildJob());

      expect(poller.markProcessed).toHaveBeenCalledWith(OUTBOX_ID);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('SSRF / DNS-rebinding re-validation', () => {
    it('re-validates the live URL and resolved address before requesting', async () => {
      await processor.process(buildJob());

      expect(mockedValidateSync).toHaveBeenCalledWith(TARGET_URL, false);
      expect(mockedAssertPublic).toHaveBeenCalledWith('example.com', false);

      // Validation must occur before the HTTP request is issued.
      const validateOrder = mockedAssertPublic.mock.invocationCallOrder[0];
      const fetchOrder = fetchMock.mock.invocationCallOrder[0];
      expect(validateOrder).toBeLessThan(fetchOrder);
    });

    it('fails closed (no fetch) when sync validation rejects the URL', async () => {
      mockedValidateSync.mockImplementation(() => {
        throw new WebhookUrlError('Disallowed private IP: 10.0.0.1');
      });

      await processor.process(buildJob());

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('fails closed (no fetch) when resolved address is private (DNS rebinding)', async () => {
      mockedAssertPublic.mockRejectedValue(
        new WebhookUrlError(
          'Hostname example.com resolves to private address 10.0.0.5',
        ),
      );

      await processor.process(buildJob());

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('does not rethrow WebhookUrlError but still bumps failure counter', async () => {
      mockedAssertPublic.mockRejectedValue(new WebhookUrlError('blocked'));

      await expect(processor.process(buildJob())).resolves.toBeUndefined();

      expect(poller.markFailed).toHaveBeenCalled();
      // bumpFailureCounter reads the webhook then updates it.
      expect(repo.findById).toHaveBeenCalledWith(WEBHOOK_ID);
      expect(repo.update).toHaveBeenCalledWith(
        WEBHOOK_ID,
        expect.objectContaining({ consecutiveFailures: 1 }),
      );
    });
  });

  describe('success path (2xx)', () => {
    it('marks the delivery processed and resets consecutive failures', async () => {
      fetchMock.mockResolvedValue(buildResponse({ status: 200 }));

      await processor.process(buildJob());

      expect(poller.markProcessed).toHaveBeenCalledWith(OUTBOX_ID);
      expect(repo.update).toHaveBeenCalledWith(
        WEBHOOK_ID,
        expect.objectContaining({
          lastStatusCode: 200,
          consecutiveFailures: 0,
        }),
      );
      expect(poller.markFailed).not.toHaveBeenCalled();
    });

    it('records a successful delivery log', async () => {
      fetchMock.mockResolvedValue(buildResponse({ status: 201 }));

      await processor.process(buildJob());

      expect(repo.createDeliveryLog).toHaveBeenCalledWith(
        expect.objectContaining({
          webhookId: WEBHOOK_ID,
          outboxEventId: OUTBOX_ID,
          eventType: EVENT_TYPE,
          statusCode: 201,
          success: true,
          error: null,
        }),
      );
    });

    it('does not reset consecutiveFailures when response is not ok', async () => {
      fetchMock.mockResolvedValue(buildResponse({ status: 404 }));

      await processor.process(buildJob());

      const updateCall = repo.update.mock.calls.find(
        ([, patch]) => 'lastStatusCode' in patch,
      );
      expect(updateCall?.[1]).not.toHaveProperty('consecutiveFailures', 0);
    });
  });

  describe('retry classification', () => {
    const transientStatuses = [500, 502, 503, 408, 429];
    const permanentStatuses = [400, 401, 403, 404, 422];

    it.each(transientStatuses)(
      'throws on transient HTTP %i so BullMQ retries',
      async (status) => {
        fetchMock.mockResolvedValue(buildResponse({ status }));

        await expect(processor.process(buildJob())).rejects.toThrow(
          `HTTP ${status}`,
        );

        // Transient path goes through the catch block: markFailed with current attempts.
        expect(poller.markFailed).toHaveBeenCalled();
      },
    );

    it('throws on network/timeout errors (transient)', async () => {
      fetchMock.mockRejectedValue(new Error('network timeout / aborted'));

      await expect(processor.process(buildJob())).rejects.toThrow(
        'network timeout',
      );
      expect(poller.markFailed).toHaveBeenCalled();
    });

    it.each(permanentStatuses)(
      'marks failed without retry on permanent HTTP %i',
      async (status) => {
        fetchMock.mockResolvedValue(buildResponse({ status }));

        // Permanent path returns normally (no throw → no BullMQ retry).
        await expect(processor.process(buildJob())).resolves.toBeUndefined();

        // markFailed is called with maxAttempts-1 / maxAttempts to exhaust retries.
        expect(poller.markFailed).toHaveBeenCalledWith(
          OUTBOX_ID,
          4,
          5,
          expect.stringContaining(`HTTP ${status}`),
        );
      },
    );

    it('records a failed delivery log for permanent errors', async () => {
      fetchMock.mockResolvedValue(
        buildResponse({ status: 400, statusText: 'Bad Request' }),
      );

      await processor.process(buildJob());

      expect(repo.createDeliveryLog).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          success: false,
          error: expect.stringContaining('HTTP 400'),
        }),
      );
    });
  });

  describe('auto-disable after maxConsecutiveFailures', () => {
    it('disables the webhook once the failure threshold is reached', async () => {
      // config.maxConsecutiveFailures = 3; existing = 2 → new = 3 → disable.
      repo.findById.mockResolvedValue(
        buildWebhookRow({ consecutiveFailures: 2 }),
      );
      fetchMock.mockResolvedValue(buildResponse({ status: 404 }));

      await processor.process(buildJob());

      expect(repo.update).toHaveBeenCalledWith(
        WEBHOOK_ID,
        expect.objectContaining({
          consecutiveFailures: 3,
          isEnabled: false,
          disabledReason: expect.stringContaining('Auto-disabled'),
        }),
      );
    });

    it('does not disable when below the threshold', async () => {
      repo.findById.mockResolvedValue(
        buildWebhookRow({ consecutiveFailures: 0 }),
      );
      fetchMock.mockResolvedValue(buildResponse({ status: 404 }));

      await processor.process(buildJob());

      const bumpCall = repo.update.mock.calls.find(
        ([, patch]) => 'consecutiveFailures' in patch && 'isEnabled' in patch,
      );
      expect(bumpCall).toBeUndefined();
      expect(repo.update).toHaveBeenCalledWith(
        WEBHOOK_ID,
        expect.objectContaining({ consecutiveFailures: 1 }),
      );
    });

    it('skips the bump when the webhook row disappeared', async () => {
      repo.findById.mockResolvedValue(null);
      fetchMock.mockResolvedValue(buildResponse({ status: 404 }));

      await processor.process(buildJob());

      // Only the lastStatusCode update happens; no consecutiveFailures update.
      const bumpCall = repo.update.mock.calls.find(
        ([, patch]) => 'consecutiveFailures' in patch,
      );
      expect(bumpCall).toBeUndefined();
    });
  });

  describe('AbortController timeout / bounded body', () => {
    it('passes an AbortSignal to fetch', async () => {
      await processor.process(buildJob());

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(init.signal).toBeInstanceOf(AbortSignal);
    });

    it('consumes (and bounds) the response body without throwing', async () => {
      const big = 'x'.repeat(config.maxResponseBytes + 1024);
      fetchMock.mockResolvedValue(buildResponse({ status: 200, body: big }));

      await expect(processor.process(buildJob())).resolves.toBeUndefined();

      expect(poller.markProcessed).toHaveBeenCalledWith(OUTBOX_ID);
    });
  });

  describe('delivery log resilience', () => {
    it('does not fail the delivery if writing the delivery log throws', async () => {
      repo.createDeliveryLog.mockRejectedValue(new Error('db down'));
      fetchMock.mockResolvedValue(buildResponse({ status: 200 }));

      await expect(processor.process(buildJob())).resolves.toBeUndefined();
      expect(poller.markProcessed).toHaveBeenCalledWith(OUTBOX_ID);
    });
  });
});
