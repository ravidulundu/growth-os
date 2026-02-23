import { BadRequestException, Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { GenerationService } from "./generation.service";

const draftSchema = z.object({
  workspaceId: z.string().uuid(),
  accountId: z.string().uuid(),
  topic: z.string().min(3),
  type: z.enum(["tweet", "thread", "reply", "quote"]).default("tweet"),
  promptInput: z.string().optional(),
  templateName: z.string().min(1).max(80).optional()
});

const versionSchema = z.object({
  workspaceId: z.string().uuid(),
  textBody: z.string().min(1)
});

const templateUpsertSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(80),
  contentType: z.enum(["tweet", "thread", "reply", "quote"]),
  systemPrompt: z.string().min(10),
  userPromptTemplate: z.string().min(10),
  promptConfig: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional()
});

const templateListQuerySchema = z.object({
  contentType: z.enum(["tweet", "thread", "reply", "quote"]).optional()
});

@Controller("generation")
export class GenerationController {
  constructor(private readonly generationService: GenerationService) {}

  @Post("draft")
  async createDraft(@Body() body: unknown) {
    const parsed = draftSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    return this.generationService.createDraft(parsed.data);
  }

  @Post("content/:contentId/version")
  async createVersion(@Param("contentId") contentId: string, @Body() body: unknown) {
    const parsed = versionSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    return this.generationService.createVersion({
      workspaceId: parsed.data.workspaceId,
      contentId,
      textBody: parsed.data.textBody
    });
  }

  @Get("content/:workspaceId/:contentId/versions")
  async listVersions(
    @Param("workspaceId") workspaceId: string,
    @Param("contentId") contentId: string
  ) {
    return this.generationService.listContentVersions(workspaceId, contentId);
  }

  @Get("templates/:workspaceId")
  async listTemplates(@Param("workspaceId") workspaceId: string, @Query() query: unknown) {
    const parsed = templateListQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.generationService.listPromptTemplates(workspaceId, parsed.data.contentType);
  }

  @Post("templates/upsert")
  async upsertTemplate(@Body() body: unknown) {
    const parsed = templateUpsertSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    return this.generationService.upsertPromptTemplate(parsed.data);
  }
}
