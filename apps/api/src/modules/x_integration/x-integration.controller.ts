import { BadRequestException, Body, Controller, Get, Param, Post } from "@nestjs/common";
import { z } from "zod";
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

@Controller("x")
export class XIntegrationController {
  constructor(private readonly xService: XIntegrationService) {}

  @Post("connect/start")
  async startConnect(@Body() body: unknown) {
    const parsed = workspacePayloadSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    return this.xService.startConnect(parsed.data.workspaceId);
  }

  @Post("connect/callback")
  async completeConnect(@Body() body: unknown) {
    const parsed = connectCallbackSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    return this.xService.completeConnect(parsed.data);
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
  async listWorkspaceAccounts(@Param("workspaceId") workspaceId: string) {
    return this.xService.listWorkspaceAccounts(workspaceId);
  }
}
