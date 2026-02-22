import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { z } from "zod";
import { GenerationService } from "./generation.service";

const draftSchema = z.object({
  workspaceId: z.string().uuid(),
  accountId: z.string().uuid(),
  topic: z.string().min(3),
  type: z.enum(["tweet", "thread"]).default("tweet"),
  promptInput: z.string().optional()
});

const versionSchema = z.object({
  workspaceId: z.string().uuid(),
  textBody: z.string().min(1)
});

@Controller("generation")
export class GenerationController {
  constructor(private readonly generationService: GenerationService) {}

  @Post("draft")
  async createDraft(@Body() body: unknown) {
    const parsed = draftSchema.parse(body);
    return this.generationService.createDraft(parsed);
  }

  @Post("content/:contentId/version")
  async createVersion(@Param("contentId") contentId: string, @Body() body: unknown) {
    const parsed = versionSchema.parse(body);
    return this.generationService.createVersion({
      workspaceId: parsed.workspaceId,
      contentId,
      textBody: parsed.textBody
    });
  }

  @Get("content/:workspaceId/:contentId/versions")
  async listVersions(
    @Param("workspaceId") workspaceId: string,
    @Param("contentId") contentId: string
  ) {
    return this.generationService.listContentVersions(workspaceId, contentId);
  }
}
