import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Req,
  UnauthorizedException
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { z } from "zod";
import { getPool } from "../../shared/db/pool";

type AuthenticatedRequest = {
  auth?: {
    userId: string;
    sessionId: string;
    workspaceId?: string;
  };
};

type OnboardingSteps = {
  workspaceValidated: boolean;
  xConnected: boolean;
  timelineIngested: boolean;
  styleExtracted: boolean;
  draftGenerated: boolean;
};

type OnboardingState = {
  workspaceId: string | null;
  steps: OnboardingSteps;
  completedAt: string | null;
  updatedAt: string | null;
};

const onboardingStepsSchema = z.object({
  workspaceValidated: z.boolean().optional(),
  xConnected: z.boolean().optional(),
  timelineIngested: z.boolean().optional(),
  styleExtracted: z.boolean().optional(),
  draftGenerated: z.boolean().optional()
});

const onboardingPatchSchema = z.object({
  workspaceId: z.string().uuid().optional(),
  steps: onboardingStepsSchema.optional(),
  completedAt: z.string().datetime().nullable().optional()
});

function defaultOnboardingSteps(): OnboardingSteps {
  return {
    workspaceValidated: false,
    xConnected: false,
    timelineIngested: false,
    styleExtracted: false,
    draftGenerated: false
  };
}

function requireAuthenticatedUserId(request: AuthenticatedRequest) {
  const userId = request.auth?.userId;
  if (!userId) {
    throw new UnauthorizedException("Missing authenticated session");
  }
  return userId;
}

function normalizeBoolean(value: unknown) {
  return value === true;
}

function normalizeOnboardingSteps(steps: unknown): OnboardingSteps {
  if (!steps || typeof steps !== "object") {
    return defaultOnboardingSteps();
  }

  const record = steps as Record<string, unknown>;
  return {
    workspaceValidated: normalizeBoolean(record.workspaceValidated),
    xConnected: normalizeBoolean(record.xConnected),
    timelineIngested: normalizeBoolean(record.timelineIngested),
    styleExtracted: normalizeBoolean(record.styleExtracted),
    draftGenerated: normalizeBoolean(record.draftGenerated)
  };
}

function mergeOnboardingSteps(base: OnboardingSteps, patch: z.infer<typeof onboardingStepsSchema>) {
  return {
    workspaceValidated: patch.workspaceValidated ?? base.workspaceValidated,
    xConnected: patch.xConnected ?? base.xConnected,
    timelineIngested: patch.timelineIngested ?? base.timelineIngested,
    styleExtracted: patch.styleExtracted ?? base.styleExtracted,
    draftGenerated: patch.draftGenerated ?? base.draftGenerated
  };
}

function allStepsCompleted(steps: OnboardingSteps) {
  return Object.values(steps).every((value) => value);
}

async function loadOnboardingState(userId: string): Promise<OnboardingState> {
  const result = await getPool().query<{
    workspace_id: string | null;
    steps_json: unknown;
    completed_at: Date | null;
    updated_at: Date | null;
  }>(
    `
      SELECT workspace_id, steps_json, completed_at, updated_at
      FROM onboarding_states
      WHERE user_id = $1
      LIMIT 1;
    `,
    [userId]
  );

  const row = result.rows[0];
  if (!row) {
    return {
      workspaceId: null,
      steps: defaultOnboardingSteps(),
      completedAt: null,
      updatedAt: null
    };
  }

  return {
    workspaceId: row.workspace_id,
    steps: normalizeOnboardingSteps(row.steps_json),
    completedAt: row.completed_at ? row.completed_at.toISOString() : null,
    updatedAt: row.updated_at ? row.updated_at.toISOString() : null
  };
}

async function upsertOnboardingState(params: {
  userId: string;
  workspaceId: string | null;
  steps: OnboardingSteps;
  completedAt: Date | null;
}) {
  const result = await getPool().query<{
    workspace_id: string | null;
    steps_json: unknown;
    completed_at: Date | null;
    updated_at: Date;
  }>(
    `
      INSERT INTO onboarding_states (
        user_id,
        workspace_id,
        steps_json,
        completed_at,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3::jsonb, $4, now(), now())
      ON CONFLICT (user_id)
      DO UPDATE SET
        workspace_id = EXCLUDED.workspace_id,
        steps_json = EXCLUDED.steps_json,
        completed_at = EXCLUDED.completed_at,
        updated_at = now()
      RETURNING workspace_id, steps_json, completed_at, updated_at;
    `,
    [params.userId, params.workspaceId, JSON.stringify(params.steps), params.completedAt]
  );

  const row = result.rows[0];
  return {
    workspaceId: row?.workspace_id ?? null,
    steps: normalizeOnboardingSteps(row?.steps_json),
    completedAt: row?.completed_at ? row.completed_at.toISOString() : null,
    updatedAt: row?.updated_at ? row.updated_at.toISOString() : null
  };
}

@Controller("auth")
export class AuthSessionController {
  @Get("session")
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  getSession(@Req() request: AuthenticatedRequest) {
    return {
      ok: true,
      userId: request.auth?.userId ?? null,
      sessionId: request.auth?.sessionId ?? null
    };
  }

  @Get("session/state")
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  async getSessionState(@Req() request: AuthenticatedRequest) {
    const userId = requireAuthenticatedUserId(request);
    return {
      ok: true,
      onboarding: await loadOnboardingState(userId)
    };
  }

  @Patch("session/state")
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  async patchSessionState(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    const parsed = onboardingPatchSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const userId = requireAuthenticatedUserId(request);
    const existing = await loadOnboardingState(userId);
    const mergedSteps = mergeOnboardingSteps(existing.steps, parsed.data.steps ?? {});
    const completedAt =
      parsed.data.completedAt !== undefined
        ? parsed.data.completedAt
          ? new Date(parsed.data.completedAt)
          : null
        : allStepsCompleted(mergedSteps)
          ? existing.completedAt
            ? new Date(existing.completedAt)
            : new Date()
          : null;

    const onboarding = await upsertOnboardingState({
      userId,
      workspaceId: parsed.data.workspaceId ?? existing.workspaceId,
      steps: mergedSteps,
      completedAt
    });

    return { ok: true, onboarding };
  }
}
