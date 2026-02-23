import { Loader2 } from "lucide-react";
import { Button } from "../../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../ui/card";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Select } from "../../ui/select";
import type { StudioController } from "../use-studio-controller";

type SettingsViewProps = {
  controller: StudioController;
};

export function SettingsView({ controller }: SettingsViewProps) {
  return (
    <>
      <Card className="motion-rise">
        <CardHeader>
          <CardTitle>Authentication</CardTitle>
          <CardDescription>
            Magic link iste. E-postadaki doğrulama linki ile oturum otomatik açılır.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              value={controller.email}
              onChange={(event) => controller.setEmail(event.target.value)}
              type="email"
              autoComplete="email"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => void controller.handleRequestMagicLink()}
              disabled={controller.activeAction !== null || controller.email.trim().length < 5}
            >
              {controller.activeAction === "Request Magic Link" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              Request Magic Link
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Workspace and X account</CardTitle>
          <CardDescription>Core identifiers and OAuth callback values.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="workspace-id">Workspace ID</Label>
            <Input
              id="workspace-id"
              value={controller.workspaceId}
              onChange={(event) => controller.setWorkspaceId(event.target.value)}
              autoComplete="off"
            />
          </div>
          <div>
            <Label htmlFor="oauth-code">OAuth code</Label>
            <Input
              id="oauth-code"
              value={controller.oauthCode}
              onChange={(event) => controller.setOauthCode(event.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => void controller.handleStartConnect()}
              disabled={!controller.workspaceId || controller.activeAction !== null}
            >
              Start Connect
            </Button>
            <Button
              variant="secondary"
              onClick={() => void controller.handleCompleteConnect()}
              disabled={
                !controller.workspaceId ||
                !controller.oauthCode ||
                !controller.connectStartResult?.state ||
                controller.activeAction !== null
              }
            >
              Complete Connect
            </Button>
          </div>

          {controller.accounts.length > 0 ? (
            <div>
              <Label htmlFor="selected-account-id">Selected account</Label>
              <Select
                id="selected-account-id"
                value={controller.selectedAccountId}
                onChange={(event) => controller.setSelectedAccountId(event.target.value)}
              >
                {controller.accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.username} ({account.id.slice(0, 8)})
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Plan and Metering</CardTitle>
          <CardDescription>Current plan limits and monthly generation usage.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => void controller.handleLoadMetering()}
              disabled={!controller.workspaceId || controller.activeAction !== null}
            >
              {controller.activeAction === "Load Metering" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              Load Metering
            </Button>
          </div>

          {controller.metering ? (
            <div className="grid gap-2 rounded-lg border border-[var(--border)] bg-[var(--background)] p-3 text-sm text-[var(--foreground)]">
              <p>
                Plan: <strong>{controller.metering.planKey}</strong>
              </p>
              <p>
                Monthly limit:{" "}
                <strong>
                  {controller.metering.monthlyGenerationLimit === null
                    ? "Unlimited"
                    : controller.metering.monthlyGenerationLimit}
                </strong>
              </p>
              <p>
                Used: <strong>{controller.metering.usedUnits}</strong>
              </p>
              <p>
                Remaining:{" "}
                <strong>
                  {controller.metering.remainingUnits === null
                    ? "Unlimited"
                    : controller.metering.remainingUnits}
                </strong>
              </p>
              <p className="text-xs text-[var(--muted-foreground)]">
                Period: {new Date(controller.metering.periodStart).toLocaleDateString()} -{" "}
                {new Date(controller.metering.periodEnd).toLocaleDateString()}
              </p>
            </div>
          ) : (
            <p className="text-sm text-[var(--muted-foreground)]">No metering data loaded.</p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
