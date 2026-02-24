import { Loader2 } from "lucide-react";
import { Button } from "../../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../ui/card";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Select } from "../../ui/select";
import type { BillingCheckoutPlanKey } from "../../../lib/api";
import type { StudioController } from "../use-studio-controller";

type SettingsViewProps = {
  controller: StudioController;
};

type BillingPlanKey = "free" | BillingCheckoutPlanKey;

type BillingPlanCardConfig = {
  key: BillingPlanKey;
  title: string;
  price: string;
  limitLabel: string;
  description: string;
};

const BILLING_PLAN_CARDS: BillingPlanCardConfig[] = [
  {
    key: "free",
    title: "Free",
    price: "$0/mo",
    limitLabel: "30 generations / month",
    description: "Starter usage for evaluation."
  },
  {
    key: "creator",
    title: "Creator",
    price: "$19/mo",
    limitLabel: "300 generations / month",
    description: "For solo creators shipping daily."
  },
  {
    key: "growth",
    title: "Growth",
    price: "$59/mo",
    limitLabel: "2,000 generations / month",
    description: "For teams scaling multi-campaign output."
  },
  {
    key: "team",
    title: "Team",
    price: "$149/mo",
    limitLabel: "10,000 generations / month",
    description: "High-throughput collaboration with headroom."
  }
];

function normalizePlanKey(planKey: string | null | undefined): BillingPlanKey | null {
  if (planKey === "mvp0") {
    return "free";
  }
  if (planKey === "free" || planKey === "creator" || planKey === "growth" || planKey === "team") {
    return planKey;
  }
  return null;
}

function AuthenticationCard({ controller }: { controller: StudioController }) {
  const disabled = controller.activeAction !== null || controller.email.trim().length < 5;

  return (
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
        <Button onClick={() => void controller.handleRequestMagicLink()} disabled={disabled}>
          {controller.activeAction === "Request Magic Link" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : null}
          Request Magic Link
        </Button>
      </CardContent>
    </Card>
  );
}

function WorkspaceCard({ controller }: { controller: StudioController }) {
  const busy = controller.activeAction !== null;
  const canStartConnect = Boolean(controller.workspaceId) && !busy;
  const canCompleteConnect =
    Boolean(controller.workspaceId) &&
    Boolean(controller.oauthCode) &&
    Boolean(controller.connectStartResult?.state) &&
    !busy;

  return (
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
          <Button onClick={() => void controller.handleStartConnect()} disabled={!canStartConnect}>
            Start Connect
          </Button>
          <Button
            variant="secondary"
            onClick={() => void controller.handleCompleteConnect()}
            disabled={!canCompleteConnect}
          >
            Complete Connect
          </Button>
        </div>
        <AccountSelector controller={controller} />
      </CardContent>
    </Card>
  );
}

function AccountSelector({ controller }: { controller: StudioController }) {
  if (controller.accounts.length === 0) {
    return null;
  }

  return (
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
  );
}

type PlanActionButtonProps = {
  controller: StudioController;
  planKey: BillingPlanKey;
  isActive: boolean;
  disabled: boolean;
};

function PlanActionButton({ controller, planKey, isActive, disabled }: PlanActionButtonProps) {
  if (isActive) {
    return (
      <Button variant="secondary" disabled>
        Current Plan
      </Button>
    );
  }

  if (planKey === "free") {
    return (
      <Button variant="outline" disabled>
        Included
      </Button>
    );
  }

  return (
    <Button
      onClick={() => void controller.handleCreateCheckoutSession(planKey)}
      disabled={disabled}
    >
      {controller.checkoutPlanInFlight === planKey ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : null}
      Upgrade
    </Button>
  );
}

type BillingPlanItemProps = {
  controller: StudioController;
  plan: BillingPlanCardConfig;
  activePlan: BillingPlanKey | null;
  disabled: boolean;
};

function BillingPlanItem({ controller, plan, activePlan, disabled }: BillingPlanItemProps) {
  const isActive = activePlan === plan.key;

  return (
    <article
      className={`rounded-xl border p-4 ${
        isActive
          ? "border-[var(--primary)] bg-[var(--primary)]/5"
          : "border-[var(--border)] bg-[var(--background)]"
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted-foreground)]">
        {plan.title}
      </p>
      <p className="mt-2 text-xl font-semibold text-[var(--foreground)]">{plan.price}</p>
      <p className="text-sm text-[var(--foreground)]">{plan.limitLabel}</p>
      <p className="mt-2 text-sm text-[var(--muted-foreground)]">{plan.description}</p>
      <div className="mt-4">
        <PlanActionButton
          controller={controller}
          planKey={plan.key}
          isActive={isActive}
          disabled={disabled}
        />
      </div>
    </article>
  );
}

function BillingPlansCard({ controller }: { controller: StudioController }) {
  const disabled = !controller.workspaceId || controller.activeAction !== null;
  const activePlan = normalizePlanKey(controller.metering?.planKey);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Billing Plans</CardTitle>
        <CardDescription>
          Choose a plan and manage your Stripe billing portal session.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          {BILLING_PLAN_CARDS.map((plan) => (
            <BillingPlanItem
              key={plan.key}
              controller={controller}
              plan={plan}
              activePlan={activePlan}
              disabled={disabled}
            />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            onClick={() => void controller.handleCreatePortalSession()}
            disabled={disabled}
          >
            {controller.portalSessionPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Manage Billing
          </Button>
          <p className="text-xs text-[var(--muted-foreground)]">
            Active plan: {activePlan ?? "unknown (load metering to resolve)"}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function MeteringSummary({ controller }: { controller: StudioController }) {
  if (!controller.metering) {
    return <p className="text-sm text-[var(--muted-foreground)]">No metering data loaded.</p>;
  }

  const billing = controller.metering.billing;
  const latestInvoice = controller.metering.latestInvoice;

  return (
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
      {billing ? (
        <p className="text-xs text-[var(--muted-foreground)]">
          Subscription: {billing.status}
          {billing.currentPeriodEnd
            ? ` • renews ${new Date(billing.currentPeriodEnd).toLocaleDateString()}`
            : ""}
          {billing.cancelAtPeriodEnd ? " • cancel at period end" : ""}
        </p>
      ) : null}
      {latestInvoice ? (
        <p className="text-xs text-[var(--muted-foreground)]">
          Latest invoice: {latestInvoice.status}
          {latestInvoice.hostedInvoiceUrl ? (
            <>
              {" "}
              •{" "}
              <a
                className="text-[var(--primary)] underline underline-offset-2"
                href={latestInvoice.hostedInvoiceUrl}
                target="_blank"
                rel="noreferrer"
              >
                open invoice
              </a>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

function MeteringCard({ controller }: { controller: StudioController }) {
  const disabled = !controller.workspaceId || controller.activeAction !== null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Plan and Metering</CardTitle>
        <CardDescription>Current plan limits and monthly generation usage.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          variant="secondary"
          onClick={() => void controller.handleLoadMetering()}
          disabled={disabled}
        >
          {controller.activeAction === "Load Metering" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : null}
          Load Metering
        </Button>
        <MeteringSummary controller={controller} />
      </CardContent>
    </Card>
  );
}

export function SettingsView({ controller }: SettingsViewProps) {
  return (
    <>
      <AuthenticationCard controller={controller} />
      <WorkspaceCard controller={controller} />
      <BillingPlansCard controller={controller} />
      <MeteringCard controller={controller} />
    </>
  );
}
