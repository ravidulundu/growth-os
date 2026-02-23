import { BadRequestException, Body, Controller, Get, Param, Post } from "@nestjs/common";
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
    const parsed = scheduleSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    return this.schedulingService.schedule({
      workspaceId: parsed.data.workspaceId,
      accountId: parsed.data.accountId,
      contentId: parsed.data.contentId,
      dedupeKey: parsed.data.dedupeKey,
      confirmHumanReview: parsed.data.confirmHumanReview,
      runAt: new Date(parsed.data.runAt)
    });
  }

  @Post("publish-now")
  async publishNow(@Body() body: unknown) {
    const parsed = baseScheduleSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    return this.schedulingService.publishNow(parsed.data);
  }

  @Get("jobs/:workspaceId")
  async listJobs(@Param("workspaceId") workspaceId: string) {
    return this.schedulingService.listJobs(workspaceId);
  }
}
