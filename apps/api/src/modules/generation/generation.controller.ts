import { BadRequestException, Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { z } from "zod";
import { captureApiEvent } from "../../shared/telemetry/api-telemetry";
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

const seriesCreateSchema = z.object({
  workspaceId: z.string().uuid(),
  accountId: z.string().uuid(),
  name: z.string().min(3).max(120),
  cadence: z.enum(["hourly", "daily", "weekly", "biweekly", "monthly"]),
  isActive: z.boolean().optional(),
  enqueueNextOnPublish: z.boolean().optional(),
  contentIds: z.array(z.string().uuid()).min(1)
});

const repurposeSchema = z.object({
  workspaceId: z.string().uuid(),
  sourceContentId: z.string().uuid(),
  targetType: z.enum(["tweet", "thread", "reply", "quote"]),
  accountId: z.string().uuid().optional(),
  promptInput: z.string().max(2000).optional(),
  templateName: z.string().min(1).max(80).optional()
});

@Controller("generation")
export class GenerationController {
  constructor(private readonly generationService: GenerationService) {}

  @Post("draft")
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async createDraft(@Body() body: unknown) {
    const parsed = draftSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const result = await this.generationService.createDraft(parsed.data);
    captureApiEvent(
      "draft_generated",
      {
        accountId: parsed.data.accountId,
        contentType: parsed.data.type,
        contentId: result.contentId
      },
      { workspaceId: parsed.data.workspaceId, critical: true }
    );
    return result;
  }

  @Post("content/:contentId/version")
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
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
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  async listVersions(
    @Param("workspaceId") workspaceId: string,
    @Param("contentId") contentId: string
  ) {
    return this.generationService.listContentVersions(workspaceId, contentId);
  }

  @Get("templates/:workspaceId")
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
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

  @Post("series")
  async createSeries(@Body() body: unknown) {
    const parsed = seriesCreateSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    return this.generationService.createSeries(parsed.data);
  }

  @Get("series/:workspaceId/:accountId")
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  async listSeries(
    @Param("workspaceId") workspaceId: string,
    @Param("accountId") accountId: string
  ) {
    return this.generationService.listSeries(workspaceId, accountId);
  }

  @Post("repurpose")
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async repurpose(@Body() body: unknown) {
    const parsed = repurposeSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    return this.generationService.repurposeContent(parsed.data);
  }
}
