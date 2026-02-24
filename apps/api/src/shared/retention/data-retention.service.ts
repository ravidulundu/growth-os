import { ForbiddenException, Injectable } from "@nestjs/common";
import { getMaintenanceQueue } from "../../modules/scheduling/queue";
import { getPool } from "../db/pool";

const maintenanceCleanupJobName = "retention.cleanup";

type RunRetentionNowParams = {
  workspaceId: string;
  userId: string;
};

function isWorkspaceAdminRole(role: string) {
  return role === "owner" || role === "admin";
}

@Injectable()
export class DataRetentionService {
  protected dbPool() {
    return getPool();
  }

  protected maintenanceQueue() {
    return getMaintenanceQueue();
  }

  private async assertWorkspaceAdmin(workspaceId: string, userId: string) {
    const membership = await this.dbPool().query<{ role: string }>(
      `
        SELECT role
        FROM workspace_members
        WHERE workspace_id = $1
          AND user_id = $2
        LIMIT 1;
      `,
      [workspaceId, userId]
    );

    const role = membership.rows[0]?.role;
    if (!role || !isWorkspaceAdminRole(role)) {
      throw new ForbiddenException("Admin access required");
    }
  }

  async runNow(params: RunRetentionNowParams) {
    await this.assertWorkspaceAdmin(params.workspaceId, params.userId);

    const job = await this.maintenanceQueue().add(
      maintenanceCleanupJobName,
      {
        workspaceId: params.workspaceId,
        trigger: "manual",
        requestedBy: params.userId
      },
      {
        jobId: `retention:manual:${params.workspaceId}:${Date.now()}`
      }
    );

    const jobId = job.id ? String(job.id) : `retention:manual:${params.workspaceId}`;
    await this.dbPool().query(
      `
        INSERT INTO audit_logs (
          workspace_id,
          actor_user_id,
          action,
          entity_type,
          entity_id,
          result,
          metadata
        )
        VALUES ($1, $2, 'data_retention.run_now_requested', 'maintenance_job', $3, 'success', $4::jsonb);
      `,
      [
        params.workspaceId,
        params.userId,
        jobId,
        JSON.stringify({ trigger: "manual", queue: "maintenance-jobs" })
      ]
    );

    return {
      ok: true,
      jobId,
      enqueuedAt: new Date().toISOString()
    };
  }
}
