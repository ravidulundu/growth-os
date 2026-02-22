import { Controller, Get, Req } from "@nestjs/common";

type AuthenticatedRequest = {
  auth?: {
    userId: string;
    sessionId: string;
    workspaceId?: string;
  };
};

@Controller("auth")
export class AuthSessionController {
  @Get("session")
  getSession(@Req() request: AuthenticatedRequest) {
    return {
      ok: true,
      userId: request.auth?.userId ?? null,
      sessionId: request.auth?.sessionId ?? null
    };
  }
}
