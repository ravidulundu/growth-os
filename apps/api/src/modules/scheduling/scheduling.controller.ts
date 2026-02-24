import { BadRequestException, Body, Controller, Get, Param, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { z } from "zod";
import { captureApiEvent } from "../../shared/telemetry/api-telemetry";
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

const manualFallbackSchema = z.object({
  workspaceId: z.string().uuid(),
  contentId: z.string().uuid(),
  reasonCode: z.string().trim().min(1),
  publishJobId: z.string().uuid().optional(),
  reminderEmail: z.string().email().optional()
});

@Controller("scheduling")
export class SchedulingController {
  constructor(private readonly schedulingService: SchedulingService) {}

  @Post("schedule")
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  async schedule(@Body() body: unknown) {
    const parsed = scheduleSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const result = await this.schedulingService.schedule({
      workspaceId: parsed.data.workspaceId,
      accountId: parsed.data.accountId,
      contentId: parsed.data.contentId,
      dedupeKey: parsed.data.dedupeKey,
      confirmHumanReview: parsed.data.confirmHumanReview,
      runAt: new Date(parsed.data.runAt)
    });
    captureApiEvent(
      "scheduled",
      {
        mode: "schedule",
        accountId: parsed.data.accountId,
        contentId: parsed.data.contentId,
        publishJobId: result.publishJobId
      },
      { workspaceId: parsed.data.workspaceId, critical: true }
    );
    return result;
  }

  @Post("publish-now")
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async publishNow(@Body() body: unknown) {
    const parsed = baseScheduleSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const result = await this.schedulingService.publishNow(parsed.data);
    captureApiEvent(
      "scheduled",
      {
        mode: "publish_now",
        accountId: parsed.data.accountId,
        contentId: parsed.data.contentId,
        publishJobId: result.publishJobId
      },
      { workspaceId: parsed.data.workspaceId, critical: true }
    );
    return result;
  }

  @Get("jobs/:workspaceId")
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  async listJobs(@Param("workspaceId") workspaceId: string) {
    return this.schedulingService.listJobs(workspaceId);
  }

  @Post("manual-fallback")
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  async createManualFallback(@Body() body: unknown) {
    const parsed = manualFallbackSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    return this.schedulingService.createManualPublishFallback(parsed.data);
  }
}
