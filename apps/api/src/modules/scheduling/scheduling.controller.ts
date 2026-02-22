import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { z } from "zod";
import { SchedulingService } from "./scheduling.service";

const baseScheduleSchema = z.object({
  workspaceId: z.string().uuid(),
  accountId: z.string().uuid(),
  contentId: z.string().uuid(),
  dedupeKey: z.string().min(8).optional(),
  confirmHumanReview: z.boolean().optional()
});

const scheduleSchema = baseScheduleSchema.extend({
  runAt: z.string().datetime()
});

@Controller("scheduling")
export class SchedulingController {
  constructor(private readonly schedulingService: SchedulingService) {}

  @Post("schedule")
  async schedule(@Body() body: unknown) {
    const parsed = scheduleSchema.parse(body);
    return this.schedulingService.schedule({
      workspaceId: parsed.workspaceId,
      accountId: parsed.accountId,
      contentId: parsed.contentId,
      dedupeKey: parsed.dedupeKey,
      confirmHumanReview: parsed.confirmHumanReview,
      runAt: new Date(parsed.runAt)
    });
  }

  @Post("publish-now")
  async publishNow(@Body() body: unknown) {
    const parsed = baseScheduleSchema.parse(body);
    return this.schedulingService.publishNow(parsed);
  }

  @Get("jobs/:workspaceId")
  async listJobs(@Param("workspaceId") workspaceId: string) {
    return this.schedulingService.listJobs(workspaceId);
  }
}
