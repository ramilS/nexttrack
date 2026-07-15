import { AxiosError, AxiosHeaders, InternalAxiosRequestConfig } from "axios";
import { describe, expect, it } from "vitest";
import {
  MigrationEntity,
  MigrationEntityStatus,
  OurApiClient,
  TransitionMigrationEntity,
} from "../loaders/api-client";
import { classifyMigrationError } from "../utils/error-classification";
import { ManifestEntityExecutor } from "./entity-executor";
import { canonicalEntity } from "./manifest.types";

const RUN_ID = "foundation-run-1";
const NOW = "2026-07-14T00:00:00.000Z";

interface SourceUser {
  id: string;
  name: string;
  email: string;
}

interface TargetUser extends SourceUser {
  targetId: string;
}

const ALLOWED_TRANSITIONS: Readonly<
  Record<MigrationEntityStatus, readonly MigrationEntityStatus[]>
> = {
  DISCOVERED: ["TRANSFORMED", "FAILED", "EXCLUDED_APPROVED"],
  TRANSFORMED: ["LOADED", "FAILED"],
  LOADED: ["VERIFIED", "FAILED"],
  VERIFIED: ["DISCOVERED"],
  FAILED: ["TRANSFORMED", "EXCLUDED_APPROVED"],
  EXCLUDED_APPROVED: ["DISCOVERED"],
};

class FakeYouTrack {
  constructor(private readonly users: SourceUser[]) {}

  extractUsers(): SourceUser[] {
    return this.users.map((user) => ({ ...user }));
  }

  rename(sourceId: string, name: string): void {
    const user = this.users.find(({ id }) => id === sourceId);
    if (!user) throw new Error(`Unknown source user ${sourceId}`);
    user.name = name;
  }
}

class FakeTarget {
  readonly createdUserSourceIds: string[] = [];
  readonly loadCallsBySourceId = new Map<string, number>();
  readonly verifyCallsBySourceId = new Map<string, number>();
  readonly loadFailure = unauthorizedError();
  private readonly users = new Map<string, TargetUser>();

  constructor(private readonly failLoadNumber?: number) {}

  async load(user: SourceUser): Promise<{ targetId: string }> {
    const callCount =
      [...this.loadCallsBySourceId.values()].reduce(
        (sum, count) => sum + count,
        0,
      ) + 1;
    this.loadCallsBySourceId.set(
      user.id,
      (this.loadCallsBySourceId.get(user.id) ?? 0) + 1,
    );
    if (callCount === this.failLoadNumber) throw this.loadFailure;

    const existing = this.users.get(user.id);
    const targetId = existing?.targetId ?? `target-${user.id}`;
    if (!existing) this.createdUserSourceIds.push(user.id);
    this.users.set(user.id, { ...user, targetId });
    return { targetId };
  }

  async verify(targetId: string, expected: SourceUser): Promise<void> {
    this.verifyCallsBySourceId.set(
      expected.id,
      (this.verifyCallsBySourceId.get(expected.id) ?? 0) + 1,
    );
    expect(this.users.get(expected.id)).toEqual({ ...expected, targetId });
  }
}

class FakeManifest {
  readonly completionRunIds: string[] = [];
  private readonly entities = new Map<string, MigrationEntity>();
  private runStatus: "RUNNING" | "COMPLETED" = "RUNNING";

  readonly api = {
    discoverEntities: async (
      runId: string,
      dto: {
        entities: Array<{
          entityType: string;
          sourceId: string;
          sourceChecksum: string;
        }>;
      },
    ) => {
      this.assertRun(runId);
      const data = dto.entities.map((input) => {
        const key = this.key(input.entityType, input.sourceId);
        let entity = this.entities.get(key);
        if (!entity) {
          entity = this.newEntity(input);
          this.entities.set(key, entity);
        } else if (entity.sourceChecksum !== input.sourceChecksum) {
          entity = {
            ...entity,
            sourceChecksum: input.sourceChecksum,
            targetId: null,
            status: "DISCOVERED",
            errorCode: null,
            errorMessage: null,
            transformedAt: null,
            loadedAt: null,
            verifiedAt: null,
            updatedAt: NOW,
          };
          this.entities.set(key, entity);
          this.runStatus = "RUNNING";
        }
        return { ...entity };
      });
      return { data };
    },
    transitionEntity: async (
      runId: string,
      input: TransitionMigrationEntity,
    ) => {
      this.assertRun(runId);
      const key = this.key(input.entityType, input.sourceId);
      const entity = this.entities.get(key);
      if (!entity) throw codedError("MIGRATION_ENTITY_NOT_FOUND");
      if (entity.sourceChecksum !== input.sourceChecksum) {
        throw codedError("MIGRATION_CHECKSUM_MISMATCH");
      }
      if (!ALLOWED_TRANSITIONS[entity.status].includes(input.status)) {
        throw codedError("MIGRATION_INVALID_STATE_TRANSITION");
      }
      if (
        (input.status === "LOADED" || input.status === "VERIFIED") &&
        !input.targetId
      ) {
        throw codedError("MIGRATION_INVALID_STATE_TRANSITION");
      }
      if (
        input.status === "FAILED" &&
        (!input.error?.code || !input.error.message)
      ) {
        throw codedError("MIGRATION_INVALID_STATE_TRANSITION");
      }

      const updated: MigrationEntity = {
        ...entity,
        status: input.status,
        targetId: input.targetId ?? entity.targetId,
        attemptCount:
          input.status === "TRANSFORMED"
            ? entity.attemptCount + 1
            : entity.attemptCount,
        errorCode:
          input.status === "FAILED"
            ? (input.error?.code ?? null)
            : entity.errorCode,
        errorMessage:
          input.status === "FAILED"
            ? (input.error?.message ?? null)
            : entity.errorMessage,
        transformedAt:
          input.status === "TRANSFORMED" ? NOW : entity.transformedAt,
        loadedAt: input.status === "LOADED" ? NOW : entity.loadedAt,
        verifiedAt: input.status === "VERIFIED" ? NOW : entity.verifiedAt,
        updatedAt: NOW,
      };
      this.entities.set(key, updated);
      return { data: { ...updated } };
    },
  } as unknown as OurApiClient;

  complete(runId: string): void {
    this.assertRun(runId);
    this.completionRunIds.push(runId);
    if (
      [...this.entities.values()].some(
        ({ status }) => status !== "VERIFIED" && status !== "EXCLUDED_APPROVED",
      )
    ) {
      throw codedError("MIGRATION_RUN_INCOMPLETE");
    }
    this.runStatus = "COMPLETED";
  }

  statuses(): MigrationEntityStatus[] {
    return [...this.entities.values()]
      .sort((left, right) => left.sourceId.localeCompare(right.sourceId))
      .map(({ status }) => status);
  }

  status(): "RUNNING" | "COMPLETED" {
    return this.runStatus;
  }

  private newEntity(input: {
    entityType: string;
    sourceId: string;
    sourceChecksum: string;
  }): MigrationEntity {
    return {
      id: `manifest-${input.sourceId}`,
      runId: RUN_ID,
      ...input,
      targetId: null,
      status: "DISCOVERED",
      attemptCount: 0,
      errorCode: null,
      errorMessage: null,
      discoveredAt: NOW,
      transformedAt: null,
      loadedAt: null,
      verifiedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    };
  }

  private key(entityType: string, sourceId: string): string {
    return `${entityType}\u0000${sourceId}`;
  }

  private assertRun(runId: string): void {
    if (runId !== RUN_ID) throw codedError("MIGRATION_RUN_NOT_FOUND");
  }
}

class ProcessInterruptedError extends Error {}

type ProcessResult =
  | { status: "COMPLETED"; entityFailures: string[] }
  | {
      status: "BLOCKED";
      blocker: "AUTHENTICATION";
      entityFailures: string[];
      originalError: unknown;
    };

class AcceptanceProcess {
  constructor(
    private readonly runId: string,
    private readonly source: FakeYouTrack,
    private readonly target: FakeTarget,
    private readonly manifest: FakeManifest,
  ) {}

  async run(interruptAfterSuccesses?: number): Promise<ProcessResult> {
    const executor = new ManifestEntityExecutor(this.runId, this.manifest.api);
    const entityFailures: string[] = [];
    let successfulExecutions = 0;

    for (const user of this.source.extractUsers()) {
      const entity = canonicalEntity(
        {
          sourceSystem: "youtrack-cloud",
          entityType: "user",
          sourceId: user.id,
        },
        user,
      );
      try {
        const result = await executor.execute(entity, {
          transform: (payload) => ({ ...payload }),
          load: (payload) => this.target.load(payload),
          verify: (targetId, payload) => this.target.verify(targetId, payload),
        });
        if (result.status === "FAILED") {
          entityFailures.push(user.id);
          continue;
        }
        successfulExecutions++;
        if (successfulExecutions === interruptAfterSuccesses) {
          throw new ProcessInterruptedError("external process interruption");
        }
      } catch (error) {
        if (error instanceof ProcessInterruptedError) throw error;
        if (classifyMigrationError(error) === "FATAL") {
          return {
            status: "BLOCKED",
            blocker: "AUTHENTICATION",
            entityFailures,
            originalError: error,
          };
        }
        throw error;
      }
    }

    this.manifest.complete(this.runId);
    return { status: "COMPLETED", entityFailures };
  }
}

function sourceUsers(): SourceUser[] {
  return [
    { id: "yt-user-1", name: "Ada", email: "ada@example.invalid" },
    { id: "yt-user-2", name: "Grace", email: "grace@example.invalid" },
    { id: "yt-user-3", name: "Linus", email: "linus@example.invalid" },
  ];
}

function codedError(code: string): Error & { code: string } {
  return Object.assign(new Error(code), { code });
}

function unauthorizedError(): AxiosError {
  const config: InternalAxiosRequestConfig = {
    method: "post",
    url: "/admin/migration/users",
    headers: new AxiosHeaders(),
  };
  return new AxiosError(
    "target authentication expired",
    "UNAUTHORIZED",
    config,
    undefined,
    {
      status: 401,
      statusText: "Unauthorized",
      headers: new AxiosHeaders(),
      config,
      data: {
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
      },
    },
  );
}

describe("manifest foundation acceptance", () => {
  it("resumes after interruption, skips unchanged verified users, and reopens only changed checksums", async () => {
    const source = new FakeYouTrack(sourceUsers());
    const target = new FakeTarget();
    const manifest = new FakeManifest();

    await expect(
      new AcceptanceProcess(RUN_ID, source, target, manifest).run(1),
    ).rejects.toBeInstanceOf(ProcessInterruptedError);
    expect(target.createdUserSourceIds).toEqual(["yt-user-1"]);
    expect(target.loadCallsBySourceId.get("yt-user-1")).toBe(1);
    expect(manifest.statuses()).toEqual(["VERIFIED"]);
    expect(manifest.status()).toBe("RUNNING");
    expect(manifest.completionRunIds).toEqual([]);

    await expect(
      new AcceptanceProcess(RUN_ID, source, target, manifest).run(),
    ).resolves.toEqual({ status: "COMPLETED", entityFailures: [] });
    expect(target.createdUserSourceIds).toEqual([
      "yt-user-1",
      "yt-user-2",
      "yt-user-3",
    ]);
    expect(new Set(target.createdUserSourceIds).size).toBe(3);
    expect(target.loadCallsBySourceId.get("yt-user-1")).toBe(1);
    expect(manifest.statuses()).toEqual(["VERIFIED", "VERIFIED", "VERIFIED"]);
    expect(manifest.status()).toBe("COMPLETED");
    expect(manifest.completionRunIds).toEqual([RUN_ID]);

    const completedLoadCounts = new Map(target.loadCallsBySourceId);
    const completedVerifyCounts = new Map(target.verifyCallsBySourceId);
    await new AcceptanceProcess(RUN_ID, source, target, manifest).run();
    expect(target.loadCallsBySourceId).toEqual(completedLoadCounts);
    expect(target.verifyCallsBySourceId).toEqual(completedVerifyCounts);
    expect(manifest.statuses()).toEqual(["VERIFIED", "VERIFIED", "VERIFIED"]);
    expect(manifest.status()).toBe("COMPLETED");
    expect(manifest.completionRunIds).toEqual([RUN_ID, RUN_ID]);

    source.rename("yt-user-2", "Grace Hopper");
    await new AcceptanceProcess(RUN_ID, source, target, manifest).run();
    expect(target.loadCallsBySourceId).toEqual(
      new Map([
        ["yt-user-1", 1],
        ["yt-user-2", 2],
        ["yt-user-3", 1],
      ]),
    );
    expect(target.verifyCallsBySourceId).toEqual(
      new Map([
        ["yt-user-1", 1],
        ["yt-user-2", 2],
        ["yt-user-3", 1],
      ]),
    );
    expect(target.createdUserSourceIds).toEqual([
      "yt-user-1",
      "yt-user-2",
      "yt-user-3",
    ]);
    expect(manifest.statuses()).toEqual(["VERIFIED", "VERIFIED", "VERIFIED"]);
    expect(manifest.status()).toBe("COMPLETED");
    expect(manifest.completionRunIds).toEqual([RUN_ID, RUN_ID, RUN_ID]);
  });

  it("stops the run at a fatal authentication failure and preserves the original error", async () => {
    const source = new FakeYouTrack(sourceUsers());
    const target = new FakeTarget(2);
    const manifest = new FakeManifest();

    const output = await new AcceptanceProcess(
      RUN_ID,
      source,
      target,
      manifest,
    ).run();

    expect(output).toMatchObject({
      status: "BLOCKED",
      blocker: "AUTHENTICATION",
      entityFailures: [],
    });
    expect(output.status).toBe("BLOCKED");
    if (output.status !== "BLOCKED") throw new Error("Expected blocked output");
    expect(output.originalError).toBe(target.loadFailure);
    expect((output.originalError as AxiosError).response?.status).toBe(401);
    expect(classifyMigrationError(output.originalError)).toBe("FATAL");
    expect(target.loadCallsBySourceId).toEqual(
      new Map([
        ["yt-user-1", 1],
        ["yt-user-2", 1],
      ]),
    );
    expect(target.loadCallsBySourceId.has("yt-user-3")).toBe(false);
    expect(manifest.statuses()).toEqual(["VERIFIED", "FAILED"]);
    expect(manifest.status()).toBe("RUNNING");
    expect(manifest.completionRunIds).toEqual([]);
  });
});
