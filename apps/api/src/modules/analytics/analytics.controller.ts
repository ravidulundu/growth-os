import { BadRequestException, Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { z } from "zod";
import { AnalyticsService } from "./analytics.service";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function requireUuidParam(value: string, name: string) {
  if (!isUuid(value)) {
    throw new BadRequestException(`${name} must be a valid UUID`);
  }
  return value;
}

const kpiQuerySchema = z.object({
  range: z.enum(["24h", "7d", "30d"]).optional()
});

const addCompetitorSchema = z.object({
  handle: z.string().trim().min(1),
  platform: z.enum(["x"]).optional(),
  limit: z.number().int().min(5).max(20).optional()
});

@Controller("analytics")
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get("published/:workspaceId/:publishedPostId")
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  async byPublishedPost(
    @Param("workspaceId") workspaceId: string,
    @Param("publishedPostId") publishedPostId: string
  ) {
    return this.analyticsService.getSnapshotsForPublishedPost(
      requireUuidParam(workspaceId, "workspaceId"),
      requireUuidParam(publishedPostId, "publishedPostId")
    );
  }

  @Get("content/:workspaceId/:contentId")
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  async byContent(
    @Param("workspaceId") workspaceId: string,
    @Param("contentId") contentId: string
  ) {
    return this.analyticsService.getSnapshotsForContent(
      requireUuidParam(workspaceId, "workspaceId"),
      requireUuidParam(contentId, "contentId")
    );
  }

  @Get("content/:workspaceId/:contentId/first-hour-alert")
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  async firstHourAlert(
    @Param("workspaceId") workspaceId: string,
    @Param("contentId") contentId: string
  ) {
    return this.analyticsService.getFirstHourAlertForContent(
      requireUuidParam(workspaceId, "workspaceId"),
      requireUuidParam(contentId, "contentId")
    );
  }

  @Get("kpi/:workspaceId")
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  async kpi(@Param("workspaceId") workspaceId: string, @Query() query: unknown) {
    const parsed = kpiQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    return this.analyticsService.getWorkspaceKpi(
      requireUuidParam(workspaceId, "workspaceId"),
      parsed.data.range ?? "7d"
    );
  }

  @Post("competitors/:workspaceId/add")
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  async addCompetitor(@Param("workspaceId") workspaceId: string, @Body() body: unknown) {
    const parsed = addCompetitorSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    return this.analyticsService.addCompetitorAccount({
      workspaceId: requireUuidParam(workspaceId, "workspaceId"),
      handle: parsed.data.handle,
      platform: parsed.data.platform,
      limit: parsed.data.limit
    });
  }

  @Get("competitors/:workspaceId/overview")
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  async competitorOverview(@Param("workspaceId") workspaceId: string) {
    return this.analyticsService.getCompetitorOverview(
      requireUuidParam(workspaceId, "workspaceId")
    );
  }
}
