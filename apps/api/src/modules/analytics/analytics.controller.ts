import { Controller, Get, Param } from "@nestjs/common";
import { AnalyticsService } from "./analytics.service";

@Controller("analytics")
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get("published/:workspaceId/:publishedPostId")
  async byPublishedPost(
    @Param("workspaceId") workspaceId: string,
    @Param("publishedPostId") publishedPostId: string
  ) {
    return this.analyticsService.getSnapshotsForPublishedPost(workspaceId, publishedPostId);
  }

  @Get("content/:workspaceId/:contentId")
  async byContent(
    @Param("workspaceId") workspaceId: string,
    @Param("contentId") contentId: string
  ) {
    return this.analyticsService.getSnapshotsForContent(workspaceId, contentId);
  }

  @Get("content/:workspaceId/:contentId/first-hour-alert")
  async firstHourAlert(
    @Param("workspaceId") workspaceId: string,
    @Param("contentId") contentId: string
  ) {
    return this.analyticsService.getFirstHourAlertForContent(workspaceId, contentId);
  }
}
