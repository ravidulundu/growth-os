import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
  @Get()
  healthcheck() {
    return {
      status: "ok",
      service: "api",
      timestamp: new Date().toISOString()
    };
  }
}
