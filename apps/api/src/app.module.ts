import { Module } from "@nestjs/common";
import { AuthController } from "./modules/auth/auth.controller";
import { AuthService } from "./modules/auth/auth.service";
import { HealthController } from "./shared/health/health.controller";

@Module({
  imports: [],
  controllers: [HealthController, AuthController],
  providers: [AuthService]
})
export class AppModule {}
