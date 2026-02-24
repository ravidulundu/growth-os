import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  RawBodyRequest,
  Req
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { Public } from "../../shared/auth/public.decorator";
import { BillingService } from "./billing.service";

const workspaceParamSchema = z.object({
  workspaceId: z.string().uuid()
});

const checkoutPlanSchema = z.enum(["creator", "growth", "team"]);

const checkoutSessionSchema = z.object({
  workspaceId: z.string().uuid(),
  planKey: checkoutPlanSchema,
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional()
});

const portalSessionSchema = z.object({
  workspaceId: z.string().uuid(),
  returnUrl: z.string().url().optional()
});

@Controller("billing")
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get("metering/:workspaceId")
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  async getWorkspaceMetering(@Param() params: unknown) {
    const parsed = workspaceParamSchema.safeParse(params);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    return this.billingService.getWorkspaceMetering(parsed.data.workspaceId);
  }

  @Post("checkout-session")
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  async createCheckoutSession(@Body() body: unknown) {
    const parsed = checkoutSessionSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    return this.billingService.createCheckoutSession(parsed.data);
  }

  @Post("portal-session")
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  async createPortalSession(@Body() body: unknown) {
    const parsed = portalSessionSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    return this.billingService.createPortalSession(parsed.data);
  }

  @Post("webhook")
  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 600 } })
  async handleStripeWebhook(
    @Req() request: RawBodyRequest<FastifyRequest>,
    @Headers("stripe-signature") signatureHeader: string | string[] | undefined
  ) {
    const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
    return this.billingService.handleStripeWebhook(request.rawBody, signature);
  }
}
