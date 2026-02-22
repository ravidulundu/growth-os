import { BadRequestException, Body, Controller, Post, Res } from "@nestjs/common";
import { FastifyReply } from "fastify";
import { z } from "zod";
import { Public } from "../../shared/auth/public.decorator";
import { AuthService } from "./auth.service";

const requestSchema = z.object({
  email: z.string().email()
});

const verifySchema = z.object({
  token: z.string().min(32)
});

export function authCookieSecure() {
  const explicit = process.env.AUTH_COOKIE_SECURE?.trim();
  if (explicit) {
    return explicit.toLowerCase() !== "false";
  }
  return process.env.NODE_ENV === "production";
}

@Controller("auth")
@Public()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("magic-link/request")
  async requestMagicLink(@Body() body: unknown) {
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    return this.authService.requestMagicLink(parsed.data.email);
  }

  @Post("magic-link/verify")
  async verifyMagicLink(@Body() body: unknown, @Res({ passthrough: true }) response: FastifyReply) {
    const parsed = verifySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const result = await this.authService.verifyMagicLink(parsed.data.token);
    const cookieParts = [
      `session_token=${encodeURIComponent(result.sessionToken)}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Strict",
      `Max-Age=${30 * 24 * 60 * 60}`
    ];

    if (authCookieSecure()) {
      cookieParts.push("Secure");
    }

    response.header("Set-Cookie", cookieParts.join("; "));

    return {
      ok: true,
      userId: result.userId
    };
  }
}
