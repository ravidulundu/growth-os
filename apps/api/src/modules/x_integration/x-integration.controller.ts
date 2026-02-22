import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { z } from "zod";
import { XIntegrationService } from "./x-integration.service";

const workspacePayloadSchema = z.object({
  workspaceId: z.string().uuid()
});

const connectCallbackSchema = workspacePayloadSchema.extend({
  state: z.string().min(1),
  codeVerifier: z.string().min(1),
  code: z.string().min(1)
});

const ingestTimelineSchema = workspacePayloadSchema.extend({
  accountId: z.string().uuid(),
  limit: z.number().int().min(1).max(20).optional()
});

@Controller("x")
export class XIntegrationController {
  constructor(private readonly xService: XIntegrationService) {}

  @Post("connect/start")
  async startConnect(@Body() body: unknown) {
    const parsed = workspacePayloadSchema.parse(body);
    return this.xService.startConnect(parsed.workspaceId);
  }

  @Post("connect/callback")
  async completeConnect(@Body() body: unknown) {
    const parsed = connectCallbackSchema.parse(body);
    return this.xService.completeConnect(parsed);
  }

  @Post("timeline/ingest")
  async ingestTimeline(@Body() body: unknown) {
    const parsed = ingestTimelineSchema.parse(body);
    return this.xService.ingestTimeline(parsed.workspaceId, parsed.accountId, parsed.limit ?? 10);
  }

  @Get("accounts/:workspaceId")
  async listWorkspaceAccounts(@Param("workspaceId") workspaceId: string) {
    return this.xService.listWorkspaceAccounts(workspaceId);
  }
}
