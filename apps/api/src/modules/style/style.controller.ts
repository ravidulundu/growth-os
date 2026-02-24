import { BadRequestException, Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { z } from "zod";
import { captureApiEvent } from "../../shared/telemetry/api-telemetry";
import { StyleService } from "./style.service";

const extractPayloadSchema = z.object({
  workspaceId: z.string().uuid(),
  accountId: z.string().uuid(),
  sourceLimit: z.number().int().min(1).max(100).optional()
});

@Controller("style")
export class StyleController {
  constructor(private readonly styleService: StyleService) {}

  @Post("extract")
  async extract(@Body() body: unknown) {
    const parsed = extractPayloadSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const result = await this.styleService.extractAndPersist(
      parsed.data.workspaceId,
      parsed.data.accountId,
      parsed.data.sourceLimit ?? 30
    );
    captureApiEvent(
      "style_extracted",
      {
        accountId: parsed.data.accountId,
        sourcePostCount: result.sourcePostCount
      },
      { workspaceId: parsed.data.workspaceId, critical: true }
    );
    return result;
  }

  @Get(":workspaceId/:accountId")
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  async getProfile(
    @Param("workspaceId") workspaceId: string,
    @Param("accountId") accountId: string,
    @Query("refresh") refresh?: string
  ) {
    if (refresh === "1") {
      await this.styleService.extractAndPersist(workspaceId, accountId, 30, { forceLlm: true });
    }

    return this.styleService.getProfile(workspaceId, accountId);
  }
}
