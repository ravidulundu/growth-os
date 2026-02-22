import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AnalyticsController } from "./modules/analytics/analytics.controller";
import { AnalyticsService } from "./modules/analytics/analytics.service";
import { AuthController } from "./modules/auth/auth.controller";
import { AuthSessionController } from "./modules/auth/auth-session.controller";
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

@Module({
  imports: [],
  controllers: [
    HealthController,
    AuthController,
    AuthSessionController,
    XIntegrationController,
    StyleController,
    GenerationController,
    SchedulingController,
    AnalyticsController
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: SessionAuthGuard
    },
    XIntegrationService,
    StyleService,
    GenerationService,
    SchedulingService,
    AnalyticsService
  ]
})
export class AppModule {}
