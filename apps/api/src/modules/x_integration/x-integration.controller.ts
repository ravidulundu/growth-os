import { BadRequestException, Body, Controller, Get, Param, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { z } from "zod";
import { captureApiEvent } from "../../shared/telemetry/api-telemetry";
import { XIntegrationService } from "./x-integration.service";

const workspacePayloadSchema = z.object({
  workspaceId: z.string().uuid()
});

const connectCallbackSchema = workspacePayloadSchema.extend({
  state: z.string().min(1),
  code: z.string().min(1)
});

const ingestTimelineSchema = workspacePayloadSchema.extend({
  accountId: z.string().uuid(),
  limit: z.number().int().min(1).max(20).optional()
});

const accountPathSchema = z.object({
  workspaceId: z.string().uuid(),
  accountId: z.string().uuid()
});

@Controller("x")
export class XIntegrationController {
  constructor(private readonly xService: XIntegrationService) {}

  @Post("connect/start")
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  async startConnect(@Body() body: unknown) {
    const parsed = workspacePayloadSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const result = await this.xService.startConnect(parsed.data.workspaceId);
    captureApiEvent(
      "x_connect_started",
      { flow: "oauth_pkce" },
      {
        workspaceId: parsed.data.workspaceId,
        critical: true
      }
    );
    return result;
  }

  @Post("connect/callback")
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  async completeConnect(@Body() body: unknown) {
    const parsed = connectCallbackSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const result = await this.xService.completeConnect(parsed.data);
    captureApiEvent(
      "x_connect_completed",
      { accountId: result.accountId },
      { workspaceId: parsed.data.workspaceId, critical: true }
    );
    return result;
  }

  @Post("timeline/ingest")
  async ingestTimeline(@Body() body: unknown) {
    const parsed = ingestTimelineSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    return this.xService.ingestTimeline(
      parsed.data.workspaceId,
      parsed.data.accountId,
      parsed.data.limit ?? 10
    );
  }

  @Get("accounts/:workspaceId")
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  async listWorkspaceAccounts(@Param("workspaceId") workspaceId: string) {
    return this.xService.listWorkspaceAccounts(workspaceId);
  }

  @Post("accounts/:workspaceId/:accountId/revoke")
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  async revokeAccount(@Param() params: Record<string, string>) {
    const parsed = accountPathSchema.safeParse(params);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    return this.xService.revokeAccount(parsed.data.workspaceId, parsed.data.accountId);
  }
}
