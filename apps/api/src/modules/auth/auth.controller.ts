import { BadRequestException, Body, Controller, Post } from "@nestjs/common";
import { z } from "zod";
import { AuthService } from "./auth.service";

const requestSchema = z.object({
  email: z.string().email()
});

const verifySchema = z.object({
  token: z.string().min(32)
});

@Controller("auth")
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
  async verifyMagicLink(@Body() body: unknown) {
    const parsed = verifySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    return this.authService.verifyMagicLink(parsed.data.token);
  }
}
