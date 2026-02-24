import { Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";

@Injectable()
export class FastifyThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const headers = req.headers as Record<string, unknown> | undefined;
    const forwardedFor = headers?.["x-forwarded-for"];
    const fromForwarded = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
    const normalizedForwarded =
      typeof fromForwarded === "string" ? fromForwarded.split(",")[0]?.trim() : "";
    if (normalizedForwarded) {
      return normalizedForwarded;
    }

    const requestIp = typeof req.ip === "string" ? req.ip : "";
    if (requestIp.trim().length > 0) {
      return requestIp;
    }

    const rawAddress =
      (req.raw as { socket?: { remoteAddress?: unknown } } | undefined)?.socket?.remoteAddress ??
      (req.socket as { remoteAddress?: unknown } | undefined)?.remoteAddress;
    if (typeof rawAddress === "string" && rawAddress.trim().length > 0) {
      return rawAddress;
    }

    return "unknown";
  }
}
