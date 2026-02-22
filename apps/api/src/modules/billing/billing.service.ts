import { HttpException, HttpStatus, Injectable, NotFoundException } from "@nestjs/common";
import type { PoolClient, QueryResult } from "pg";
import { getPool } from "../../shared/db/pool";

type PlanConfig = {
  monthlyGenerationLimit: number | null;
};

type PlanKey = "mvp0" | "free" | "creator" | "growth" | "team";

const PLAN_CONFIGS: Record<PlanKey, PlanConfig> = {
  mvp0: { monthlyGenerationLimit: null },
  free: { monthlyGenerationLimit: 30 },
  creator: { monthlyGenerationLimit: 300 },
  growth: { monthlyGenerationLimit: 2_000 },
  team: { monthlyGenerationLimit: 10_000 }
};

const DEFAULT_PLAN_KEY: PlanKey = "mvp0";

type QueryExecutor = {
  query: <T extends Record<string, unknown> = Record<string, unknown>>(
    queryText: string,
    params?: unknown[]
  ) => Promise<QueryResult<T>>;
};

export type WorkspaceMetering = {
  planKey: string;
  monthlyGenerationLimit: number | null;
  usedUnits: number;
  remainingUnits: number | null;
  periodStart: string;
  periodEnd: string;
};

function planConfigFor(planKey: string): PlanConfig {
  return PLAN_CONFIGS[planKey as PlanKey] ?? PLAN_CONFIGS[DEFAULT_PLAN_KEY];
}

function monthRange(reference: Date) {
  const periodStart = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1));
  const periodEnd = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() + 1, 1));
  return { periodStart, periodEnd };
}

@Injectable()
export class BillingService {
  protected dbPool() {
    return getPool();
  }

  private async resolveWorkspacePlanKey(workspaceId: string, executor: QueryExecutor) {
    const result = await executor.query<{ plan_key: string }>(
      `
        SELECT plan_key
        FROM workspaces
        WHERE id = $1
        LIMIT 1;
      `,
      [workspaceId]
    );

    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException("Workspace not found");
    }

    return row.plan_key;
  }

  private async monthlyUsage(
    workspaceId: string,
    eventType: string,
    periodStart: Date,
    periodEnd: Date,
    executor: QueryExecutor
  ) {
    const result = await executor.query<{ used_units: string }>(
      `
        SELECT COALESCE(SUM(units), 0)::text AS used_units
        FROM usage_events
        WHERE workspace_id = $1
          AND event_type = $2
          AND occurred_at >= $3
          AND occurred_at < $4;
      `,
      [workspaceId, eventType, periodStart, periodEnd]
    );

    return Number(result.rows[0]?.used_units ?? 0);
  }

  async getWorkspaceMetering(
    workspaceId: string,
    reference = new Date()
  ): Promise<WorkspaceMetering> {
    const pool = this.dbPool();
    const { periodStart, periodEnd } = monthRange(reference);
    const planKey = await this.resolveWorkspacePlanKey(workspaceId, pool);
    const { monthlyGenerationLimit } = planConfigFor(planKey);
    const usedUnits = await this.monthlyUsage(
      workspaceId,
      "content.generate",
      periodStart,
      periodEnd,
      pool
    );

    return {
      planKey,
      monthlyGenerationLimit,
      usedUnits,
      remainingUnits:
        monthlyGenerationLimit === null ? null : Math.max(0, monthlyGenerationLimit - usedUnits),
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString()
    };
  }

  async enforceGenerationLimit(
    workspaceId: string,
    executor: QueryExecutor,
    requestedUnits = 1,
    reference = new Date()
  ) {
    await executor.query(`SELECT pg_advisory_xact_lock(hashtext($1::text));`, [workspaceId]);

    const { periodStart, periodEnd } = monthRange(reference);
    const planKey = await this.resolveWorkspacePlanKey(workspaceId, executor);
    const { monthlyGenerationLimit } = planConfigFor(planKey);
    const usedUnits = await this.monthlyUsage(
      workspaceId,
      "content.generate",
      periodStart,
      periodEnd,
      executor
    );

    if (monthlyGenerationLimit !== null && usedUnits + requestedUnits > monthlyGenerationLimit) {
      throw new HttpException(
        `Monthly generation limit reached for plan '${planKey}'.`,
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    return {
      planKey,
      monthlyGenerationLimit,
      usedUnits,
      remainingUnits:
        monthlyGenerationLimit === null
          ? null
          : Math.max(0, monthlyGenerationLimit - (usedUnits + requestedUnits)),
      periodStart,
      periodEnd
    };
  }

  newTransactionExecutor(client: PoolClient): QueryExecutor {
    return client;
  }
}
