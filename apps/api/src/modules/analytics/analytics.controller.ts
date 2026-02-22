import { BadRequestException, Controller, Get, Param } from "@nestjs/common";
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

@Controller("analytics")
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get("published/:workspaceId/:publishedPostId")
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
  async firstHourAlert(
    @Param("workspaceId") workspaceId: string,
    @Param("contentId") contentId: string
  ) {
    return this.analyticsService.getFirstHourAlertForContent(
      requireUuidParam(workspaceId, "workspaceId"),
      requireUuidParam(contentId, "contentId")
    );
  }
}
