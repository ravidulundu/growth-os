import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { ThrottlerModule } from "@nestjs/throttler";
import { AnalyticsController } from "./modules/analytics/analytics.controller";
import { AnalyticsService } from "./modules/analytics/analytics.service";
import { AuthController } from "./modules/auth/auth.controller";
import { AuthSessionController } from "./modules/auth/auth-session.controller";
import { BillingController } from "./modules/billing/billing.controller";
import { BillingService } from "./modules/billing/billing.service";
import { GenerationController } from "./modules/generation/generation.controller";
import { GenerationService } from "./modules/generation/generation.service";
import { SchedulingController } from "./modules/scheduling/scheduling.controller";
import { SchedulingService } from "./modules/scheduling/scheduling.service";
import { StyleController } from "./modules/style/style.controller";
import { StyleService } from "./modules/style/style.service";
import { XIntegrationController } from "./modules/x_integration/x-integration.controller";
import { XIntegrationService } from "./modules/x_integration/x-integration.service";
import { SessionAuthGuard } from "./shared/auth/session-auth.guard";
import { HealthController } from "./shared/health/health.controller";
import { FastifyThrottlerGuard } from "./shared/rate-limit/fastify-throttler.guard";
import { DataRetentionController } from "./shared/retention/data-retention.controller";
import { DataRetentionService } from "./shared/retention/data-retention.service";
import { SentryExceptionFilter } from "./shared/telemetry/sentry-exception.filter";

@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: [
        {
          name: "default",
          ttl: 60_000,
          limit: 60
        }
      ]
    })
  ],
  controllers: [
    HealthController,
    AuthController,
    AuthSessionController,
    BillingController,
    XIntegrationController,
    StyleController,
    GenerationController,
    SchedulingController,
    AnalyticsController,
    DataRetentionController
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: SentryExceptionFilter
    },
    {
      provide: APP_GUARD,
      useClass: FastifyThrottlerGuard
    },
    {
      provide: APP_GUARD,
      useClass: SessionAuthGuard
    },
    XIntegrationService,
    StyleService,
    BillingService,
    GenerationService,
    SchedulingService,
    AnalyticsService,
    DataRetentionService
  ]
})
export class AppModule {}
