import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { z } from "zod";
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
    const parsed = extractPayloadSchema.parse(body);
    return this.styleService.extractAndPersist(
      parsed.workspaceId,
      parsed.accountId,
      parsed.sourceLimit ?? 30
    );
  }

  @Get(":workspaceId/:accountId")
  async getProfile(
    @Param("workspaceId") workspaceId: string,
    @Param("accountId") accountId: string,
    @Query("refresh") refresh?: string
  ) {
    if (refresh === "1") {
      await this.styleService.extractAndPersist(workspaceId, accountId);
    }

    return this.styleService.getProfile(workspaceId, accountId);
  }
}
