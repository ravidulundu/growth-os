import {
  BadRequestException,
  Controller,
  Param,
  Post,
  Req,
  UnauthorizedException
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { z } from "zod";
import { DataRetentionService } from "./data-retention.service";

type AuthenticatedRequest = {
  auth?: {
    userId: string;
    sessionId: string;
    workspaceId?: string;
  };
};

const workspacePathSchema = z.object({
  workspaceId: z.string().uuid()
});

@Controller("workspace")
export class DataRetentionController {
  constructor(private readonly dataRetentionService: DataRetentionService) {}

  @Post(":workspaceId/data-retention/run-now")
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async runNow(@Param() params: Record<string, string>, @Req() request: AuthenticatedRequest) {
    const parsedParams = workspacePathSchema.safeParse(params);
    if (!parsedParams.success) {
      throw new BadRequestException(parsedParams.error.flatten());
    }

    const userId = request.auth?.userId;
    if (!userId) {
      throw new UnauthorizedException("Missing authenticated session");
    }

    return this.dataRetentionService.runNow({
      workspaceId: parsedParams.data.workspaceId,
      userId
    });
  }
}
