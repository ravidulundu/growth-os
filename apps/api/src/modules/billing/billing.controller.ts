import { BadRequestException, Controller, Get, Param } from "@nestjs/common";
import { z } from "zod";
import { BillingService } from "./billing.service";

const workspaceParamSchema = z.object({
  workspaceId: z.string().uuid()
});

@Controller("billing")
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get("metering/:workspaceId")
  async getWorkspaceMetering(@Param() params: unknown) {
    const parsed = workspaceParamSchema.safeParse(params);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    return this.billingService.getWorkspaceMetering(parsed.data.workspaceId);
  }
}
