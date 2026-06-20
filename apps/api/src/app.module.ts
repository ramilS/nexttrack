import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { ZodSerializerInterceptor } from 'nestjs-zod';
import { AppZodValidationPipe } from './common/pipes/app-zod-validation.pipe';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { TimeoutInterceptor } from './common/interceptors/timeout.interceptor';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { LoggerModule } from 'nestjs-pino';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { createLoggerConfig } from './common/logger/logger.config';
import { OpsAuthMiddleware } from './common/ops/ops-auth.middleware';
import { PrismaModule } from './prisma/prisma.module';
import { BackgroundTasksModule } from './common/background/background-tasks.module';
import { IdempotencyModule } from './common/idempotency/idempotency.module';
import { RepositoryModule } from './common/repository/repository.module';
import { SharedRepositoriesModule } from './common/repository/shared-repositories.module';
import { ValkeyModule } from './valkey/valkey.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { HealthModule } from './modules/health/health.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { MailModule } from './modules/mail/mail.module';
import { SsoModule } from './modules/sso/sso.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { WorkflowsModule } from './modules/workflows/workflows.module';
import { TagsModule } from './modules/tags/tags.module';
import { IssuesModule } from './modules/issues/issues.module';
import { CommentsModule } from './modules/comments/comments.module';
import { ActivitiesModule } from './modules/activities/activities.module';
import { AttachmentsModule } from './modules/attachments/attachments.module';
import { MentionsModule } from './modules/mentions/mentions.module';
import { CustomFieldsModule } from './modules/custom-fields/custom-fields.module';
import { VersionsModule } from './modules/versions/versions.module';
import { SearchModule } from './modules/search/search.module';
import { BoardsModule } from './modules/boards/boards.module';
import { SprintsModule } from './modules/sprints/sprints.module';
import { TimeTrackingModule } from './modules/time-tracking/time-tracking.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { OutboxModule } from './modules/outbox/outbox.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { TelegramModule } from './modules/telegram/telegram.module';
import { MigrationModule } from './modules/migration/migration.module';
import { IssueLinksModule } from './modules/issue-links/issue-links.module';
import { TeamsModule } from './modules/teams/teams.module';
import { AutoAssignModule } from './modules/auto-assign/auto-assign.module';
import { DashboardsModule } from './modules/dashboards/dashboards.module';
import { KnowledgeBaseModule } from './modules/knowledge-base/knowledge-base.module';
import { GanttModule } from './modules/gantt/gantt.module';
import { WorkflowAutomationModule } from './modules/workflow-automation/workflow-automation.module';
import { RolesModule } from './modules/roles/roles.module';
import { IssueEventsModule } from './modules/issues/events/issue-events.module';
import { AiDocsModule } from './modules/ai-docs/ai-docs.module';
import { CommentEventsModule } from './modules/comments/events/comment-events.module';
import { TagEventsModule } from './modules/tags/events/tag-events.module';
import {
  appConfig,
  databaseConfig,
  authConfig,
  valkeyConfig,
  mailConfig,
  ssoConfig,
  storageConfig,
  elasticsearchConfig,
  notificationConfig,
  websocketConfig,
  outboxConfig,
  webhookConfig,
  telegramConfig,
  migrationConfig,
  opsConfig,
  aiDocsConfig,
  timeTrackingConfig,
} from './config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../../.env',
      load: [
        appConfig,
        databaseConfig,
        authConfig,
        valkeyConfig,
        mailConfig,
        ssoConfig,
        storageConfig,
        elasticsearchConfig,
        notificationConfig,
        websocketConfig,
        outboxConfig,
        webhookConfig,
        telegramConfig,
        migrationConfig,
        opsConfig,
        aiDocsConfig,
        timeTrackingConfig,
      ],
    }),
    LoggerModule.forRootAsync({
      inject: [appConfig.KEY],
      useFactory: (config: ConfigType<typeof appConfig>) =>
        createLoggerConfig(config.nodeEnv),
    }),
    ThrottlerModule.forRoot(
      process.env.NODE_ENV === 'test'
        ? [{ name: 'default', ttl: 0, limit: 0 }] // Effectively disable throttling in test
        : [
            { name: 'short', ttl: 1000, limit: 3 },
            { name: 'medium', ttl: 10000, limit: 20 },
            { name: 'long', ttl: 60000, limit: 100 },
          ],
    ),
    BullModule.forRootAsync({
      inject: [valkeyConfig.KEY],
      useFactory: (valkey: ConfigType<typeof valkeyConfig>) => ({
        connection: {
          url: valkey.url,
        },
      }),
    }),
    EventEmitterModule.forRoot(),
    PrismaModule,
    BackgroundTasksModule,
    IdempotencyModule,
    RepositoryModule,
    SharedRepositoriesModule,
    ValkeyModule,
    AuthModule,
    UsersModule,
    HealthModule,
    MetricsModule,
    MailModule,
    SsoModule,
    ProjectsModule,
    WorkflowsModule,
    TagsModule,
    IssuesModule,
    CommentsModule,
    ActivitiesModule,
    AttachmentsModule,
    MentionsModule,
    CustomFieldsModule,
    VersionsModule,
    SearchModule,
    BoardsModule,
    SprintsModule,
    TimeTrackingModule,
    OutboxModule,
    NotificationsModule,
    RealtimeModule,
    WebhooksModule,
    TelegramModule,
    MigrationModule,
    IssueLinksModule,
    TeamsModule,
    AutoAssignModule,
    DashboardsModule,
    KnowledgeBaseModule,
    GanttModule,
    WorkflowAutomationModule,
    RolesModule,
    IssueEventsModule,
    CommentEventsModule,
    TagEventsModule,
    AiDocsModule,
  ],
  providers: [
    // Global authentication is secure-by-default. Routes opt out
    // via @Public() (login, refresh, SSO callbacks, health, etc.).
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // Wraps every JSON response in { data, meta } envelope. Paginated
    // responses ({ items, meta }) pass through unchanged. @Res() handlers
    // without passthrough:true bypass this interceptor.
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
    // Bounds every request handler with APP_REQUEST_TIMEOUT_MS (default 30s);
    // rxjs TimeoutError is mapped to 408 RequestTimeoutException.
    {
      provide: APP_INTERCEPTOR,
      useClass: TimeoutInterceptor,
    },
    // Serializes returns of @ApiEnvelope/@ApiPaginated/@ZodSerializerDto
    // handlers through their response schema. MUST stay registered after
    // TransformInterceptor: the innermost interceptor maps the response
    // first, so the schema sees the raw handler return, not the envelope.
    {
      provide: APP_INTERCEPTOR,
      useClass: ZodSerializerInterceptor,
    },
    // Registered here (not main.ts) so every app context — prod bootstrap,
    // integration harness — gets identical error envelopes and DomainError
    // → HTTP status mapping.
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    // Validates handler params typed as createZodDto classes; everything
    // else (@Param('id'), custom decorators) passes through untouched.
    {
      provide: APP_PIPE,
      useClass: AppZodValidationPipe,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(OpsAuthMiddleware).forRoutes('internal/{*splat}');
  }
}
