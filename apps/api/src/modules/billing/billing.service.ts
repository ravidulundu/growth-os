import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException
} from "@nestjs/common";
import type { PoolClient, QueryResult } from "pg";
import Stripe from "stripe";
import { getPool } from "../../shared/db/pool";
import { isUuid } from "../../shared/validation/uuid";

type PlanConfig = {
  monthlyGenerationLimit: number | null;
};

export type PlanKey = "mvp0" | "free" | "creator" | "growth" | "team";
export type CheckoutPlanKey = Exclude<PlanKey, "mvp0" | "free">;

const PLAN_CONFIGS: Record<PlanKey, PlanConfig> = {
  mvp0: { monthlyGenerationLimit: null },
  free: { monthlyGenerationLimit: 30 },
  creator: { monthlyGenerationLimit: 300 },
  growth: { monthlyGenerationLimit: 2_000 },
  team: { monthlyGenerationLimit: 10_000 }
};

const DEFAULT_PLAN_KEY: PlanKey = "mvp0";
const BILLING_PROVIDER = "stripe";
const GENERATION_EVENT_TYPE = "content.generate";
const STRIPE_SUBSCRIPTION_ENTITLED_STATUSES = new Set(["trialing", "active", "past_due", "unpaid"]);

const CHECKOUT_PLAN_KEYS: readonly CheckoutPlanKey[] = ["creator", "growth", "team"];
const billingLogger = new Logger("BillingService");
const STRIPE_PRICE_ENV_ALIASES: Record<PlanKey, readonly string[]> = {
  mvp0: ["STRIPE_PRICE_ID_MVP0", "STRIPE_PRICE_MVP0_IDS"],
  free: ["STRIPE_PRICE_ID_FREE", "STRIPE_PRICE_FREE_IDS"],
  creator: ["STRIPE_PRICE_ID_CREATOR", "STRIPE_PRICE_CREATOR_IDS"],
  growth: ["STRIPE_PRICE_ID_GROWTH", "STRIPE_PRICE_GROWTH_IDS"],
  team: ["STRIPE_PRICE_ID_TEAM", "STRIPE_PRICE_TEAM_IDS"]
};

type QueryExecutor = {
  query: <T extends Record<string, unknown> = Record<string, unknown>>(
    queryText: string,
    params?: unknown[]
  ) => Promise<QueryResult<T>>;
};

type MonthlyUsageParams = {
  workspaceId: string;
  eventType: string;
  periodStart: Date;
  periodEnd: Date;
  executor: QueryExecutor;
};

export type CheckoutSessionParams = {
  workspaceId: string;
  planKey: CheckoutPlanKey;
  successUrl?: string;
  cancelUrl?: string;
};

export type PortalSessionParams = {
  workspaceId: string;
  returnUrl?: string;
};

type BillingSubscriptionSummary = {
  provider: "stripe";
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  planKey: PlanKey | null;
};

type BillingInvoiceSummary = {
  status: string;
  amountCents: number;
  currency: string | null;
  hostedInvoiceUrl: string | null;
  invoicePdfUrl: string | null;
  periodEnd: string | null;
  paidAt: string | null;
};

export type WorkspaceMetering = {
  planKey: string;
  monthlyGenerationLimit: number | null;
  usedUnits: number;
  remainingUnits: number | null;
  periodStart: string;
  periodEnd: string;
  billing: BillingSubscriptionSummary | null;
  latestInvoice: BillingInvoiceSummary | null;
};

type StripeWebhookResponse = {
  ok: true;
  duplicate: boolean;
  eventId: string;
};

type StripeSubscriptionSnapshot = {
  workspaceId: string;
  customerId: string;
  subscriptionId: string | null;
  priceId: string | null;
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  metadata: Record<string, unknown>;
};

type StripeInvoiceSnapshot = {
  workspaceId: string;
  customerId: string;
  subscriptionId: string | null;
  invoiceId: string;
  status: string;
  amountCents: number;
  currency: string | null;
  hostedInvoiceUrl: string | null;
  invoicePdfUrl: string | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  paidAt: Date | null;
  metadata: Record<string, unknown>;
};

type ResolveWorkspaceParams = {
  executor: QueryExecutor;
  metadataWorkspaceId: string | null;
  subscriptionId: string | null;
  customerId: string | null;
};

function planConfigFor(planKey: string): PlanConfig {
  return PLAN_CONFIGS[planKey as PlanKey] ?? PLAN_CONFIGS[DEFAULT_PLAN_KEY];
}

function monthRange(reference: Date) {
  const periodStart = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1));
  const periodEnd = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() + 1, 1));
  return { periodStart, periodEnd };
}

function parseCsvEnv(value: string | undefined) {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function normalizeAbsoluteHttpUrl(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    return null;
  }
  return trimmed.replace(/\/+$/, "");
}

function defaultAppBaseUrl() {
  return normalizeAbsoluteHttpUrl(process.env.APP_URL) ?? "http://localhost:3010";
}

function isUndefinedTableError(error: unknown): boolean {
  if (typeof error !== "object" || !error || !("code" in error)) {
    return false;
  }
  return (error as { code?: unknown }).code === "42P01";
}

function normalizeExpandableId(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value !== "object" || !value || !("id" in value)) {
    return null;
  }
  const candidate = (value as { id?: unknown }).id;
  return typeof candidate === "string" ? candidate : null;
}

function workspaceIdFromMetadata(metadata: Stripe.Metadata | null | undefined) {
  const candidate = metadata?.workspaceId;
  if (typeof candidate !== "string") {
    return null;
  }
  return isUuid(candidate) ? candidate : null;
}

function stripeTimestampToDate(timestamp: number | null | undefined) {
  if (typeof timestamp !== "number") {
    return null;
  }
  return new Date(timestamp * 1000);
}

function firstStripePriceId(subscription: Stripe.Subscription): string | null {
  const firstItem = subscription.items.data[0];
  return firstItem?.price?.id ?? null;
}

function toSafeJsonObject(metadata: Stripe.Metadata | null | undefined): Record<string, unknown> {
  if (!metadata) {
    return {};
  }

  return Object.entries(metadata).reduce<Record<string, unknown>>((result, [key, value]) => {
    if (typeof value === "string") {
      result[key] = value;
    }
    return result;
  }, {});
}

@Injectable()
export class BillingService {
  private stripeClient: Stripe | null = null;

  protected dbPool() {
    return getPool();
  }

  private stripeSecretKey() {
    return process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  }

  private stripeWebhookSecret() {
    return process.env.STRIPE_WEBHOOK_SECRET?.trim() ?? "";
  }

  private stripePortalConfigurationId() {
    const value = process.env.STRIPE_BILLING_PORTAL_CONFIGURATION_ID?.trim() ?? "";
    return value.length > 0 ? value : null;
  }

  private stripePriceIdsForPlan(planKey: PlanKey) {
    const ids = new Set<string>();
    for (const envKey of STRIPE_PRICE_ENV_ALIASES[planKey]) {
      for (const value of parseCsvEnv(process.env[envKey])) {
        ids.add(value);
      }
    }
    return [...ids];
  }

  private priceIdToPlanKeyMap() {
    const map = new Map<string, PlanKey>();
    const planKeys = Object.keys(STRIPE_PRICE_ENV_ALIASES) as PlanKey[];
    for (const planKey of planKeys) {
      for (const id of this.stripePriceIdsForPlan(planKey)) {
        map.set(id, planKey);
      }
    }
    return map;
  }

  private planKeyFromStripePriceId(priceId: string | null) {
    if (!priceId) {
      return null;
    }
    return this.priceIdToPlanKeyMap().get(priceId) ?? null;
  }

  private resolveCheckoutPriceId(planKey: CheckoutPlanKey) {
    return this.stripePriceIdsForPlan(planKey)[0] ?? null;
  }

  private getStripeClient() {
    if (this.stripeClient) {
      return this.stripeClient;
    }

    const secretKey = this.stripeSecretKey();
    if (!secretKey) {
      return null;
    }

    this.stripeClient = new Stripe(secretKey, { maxNetworkRetries: 2 });
    return this.stripeClient;
  }

  private requireStripeClient() {
    const stripe = this.getStripeClient();
    if (!stripe) {
      throw new ServiceUnavailableException("Stripe integration is not configured");
    }
    return stripe;
  }

  private requireStripeWebhookSecret() {
    const secret = this.stripeWebhookSecret();
    if (!secret) {
      throw new ServiceUnavailableException("Stripe webhook secret is not configured");
    }
    return secret;
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

  private async resolveWorkspaceSubscriptionPlanKey(workspaceId: string, executor: QueryExecutor) {
    try {
      const result = await executor.query<{ provider_price_id: string | null; status: string }>(
        `
          SELECT provider_price_id, status
          FROM billing_subscriptions
          WHERE workspace_id = $1
            AND provider = $2
          ORDER BY updated_at DESC
          LIMIT 1;
        `,
        [workspaceId, BILLING_PROVIDER]
      );

      const row = result.rows[0];
      if (!row || !STRIPE_SUBSCRIPTION_ENTITLED_STATUSES.has(row.status)) {
        return null;
      }
      return this.planKeyFromStripePriceId(row.provider_price_id);
    } catch (error) {
      if (isUndefinedTableError(error)) {
        return null;
      }
      throw error;
    }
  }

  private async resolveEffectivePlanKey(workspaceId: string, executor: QueryExecutor) {
    const [workspacePlanKey, subscriptionPlanKey] = await Promise.all([
      this.resolveWorkspacePlanKey(workspaceId, executor),
      this.resolveWorkspaceSubscriptionPlanKey(workspaceId, executor)
    ]);
    return subscriptionPlanKey ?? workspacePlanKey;
  }

  private async monthlyUsage({
    workspaceId,
    eventType,
    periodStart,
    periodEnd,
    executor
  }: MonthlyUsageParams) {
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

  private async loadWorkspaceBillingSummary(
    workspaceId: string,
    executor: QueryExecutor
  ): Promise<BillingSubscriptionSummary | null> {
    try {
      const result = await executor.query<{
        status: string;
        cancel_at_period_end: boolean;
        current_period_end: Date | null;
        provider_price_id: string | null;
      }>(
        `
          SELECT status, cancel_at_period_end, current_period_end, provider_price_id
          FROM billing_subscriptions
          WHERE workspace_id = $1
            AND provider = $2
          ORDER BY updated_at DESC
          LIMIT 1;
        `,
        [workspaceId, BILLING_PROVIDER]
      );

      const row = result.rows[0];
      if (!row) {
        return null;
      }

      return {
        provider: "stripe",
        status: row.status,
        cancelAtPeriodEnd: row.cancel_at_period_end,
        currentPeriodEnd: row.current_period_end ? row.current_period_end.toISOString() : null,
        planKey: this.planKeyFromStripePriceId(row.provider_price_id)
      };
    } catch (error) {
      if (isUndefinedTableError(error)) {
        return null;
      }
      throw error;
    }
  }

  private async loadWorkspaceLatestInvoice(
    workspaceId: string,
    executor: QueryExecutor
  ): Promise<BillingInvoiceSummary | null> {
    try {
      const result = await executor.query<{
        status: string;
        amount_cents: number;
        currency: string | null;
        hosted_invoice_url: string | null;
        invoice_pdf_url: string | null;
        period_end: Date | null;
        paid_at: Date | null;
      }>(
        `
          SELECT
            status,
            amount_cents,
            currency,
            hosted_invoice_url,
            invoice_pdf_url,
            period_end,
            paid_at
          FROM billing_invoices
          WHERE workspace_id = $1
            AND provider = $2
          ORDER BY updated_at DESC
          LIMIT 1;
        `,
        [workspaceId, BILLING_PROVIDER]
      );

      const row = result.rows[0];
      if (!row) {
        return null;
      }

      return {
        status: row.status,
        amountCents: row.amount_cents,
        currency: row.currency,
        hostedInvoiceUrl: row.hosted_invoice_url,
        invoicePdfUrl: row.invoice_pdf_url,
        periodEnd: row.period_end ? row.period_end.toISOString() : null,
        paidAt: row.paid_at ? row.paid_at.toISOString() : null
      };
    } catch (error) {
      if (isUndefinedTableError(error)) {
        return null;
      }
      throw error;
    }
  }

  private async findWorkspaceIdBySubscriptionId(
    executor: QueryExecutor,
    subscriptionId: string
  ): Promise<string | null> {
    try {
      const result = await executor.query<{ workspace_id: string }>(
        `
          SELECT workspace_id
          FROM billing_subscriptions
          WHERE provider = $1
            AND provider_subscription_id = $2
          LIMIT 1;
        `,
        [BILLING_PROVIDER, subscriptionId]
      );

      return result.rows[0]?.workspace_id ?? null;
    } catch (error) {
      if (isUndefinedTableError(error)) {
        return null;
      }
      throw error;
    }
  }

  private async findWorkspaceIdByCustomerId(
    executor: QueryExecutor,
    customerId: string
  ): Promise<string | null> {
    try {
      const customerResult = await executor.query<{ workspace_id: string }>(
        `
          SELECT workspace_id
          FROM billing_customers
          WHERE provider = $1
            AND provider_customer_id = $2
          LIMIT 1;
        `,
        [BILLING_PROVIDER, customerId]
      );
      const customerWorkspaceId = customerResult.rows[0]?.workspace_id;
      if (customerWorkspaceId) {
        return customerWorkspaceId;
      }
    } catch (error) {
      if (!isUndefinedTableError(error)) {
        throw error;
      }
    }

    try {
      const subscriptionResult = await executor.query<{ workspace_id: string }>(
        `
          SELECT workspace_id
          FROM billing_subscriptions
          WHERE provider = $1
            AND provider_customer_id = $2
          ORDER BY updated_at DESC
          LIMIT 1;
        `,
        [BILLING_PROVIDER, customerId]
      );
      return subscriptionResult.rows[0]?.workspace_id ?? null;
    } catch (error) {
      if (isUndefinedTableError(error)) {
        return null;
      }
      throw error;
    }
  }

  private async findStripeCustomerIdByWorkspace(
    executor: QueryExecutor,
    workspaceId: string
  ): Promise<string | null> {
    try {
      const customerResult = await executor.query<{ provider_customer_id: string }>(
        `
          SELECT provider_customer_id
          FROM billing_customers
          WHERE workspace_id = $1
            AND provider = $2
          LIMIT 1;
        `,
        [workspaceId, BILLING_PROVIDER]
      );
      const customerId = customerResult.rows[0]?.provider_customer_id;
      if (customerId) {
        return customerId;
      }
    } catch (error) {
      if (!isUndefinedTableError(error)) {
        throw error;
      }
    }

    try {
      const subscriptionResult = await executor.query<{ provider_customer_id: string }>(
        `
          SELECT provider_customer_id
          FROM billing_subscriptions
          WHERE workspace_id = $1
            AND provider = $2
          ORDER BY updated_at DESC
          LIMIT 1;
        `,
        [workspaceId, BILLING_PROVIDER]
      );
      return subscriptionResult.rows[0]?.provider_customer_id ?? null;
    } catch (error) {
      if (isUndefinedTableError(error)) {
        return null;
      }
      throw error;
    }
  }

  private async resolveWorkspaceIdForSubscription(params: ResolveWorkspaceParams) {
    if (params.metadataWorkspaceId) {
      return params.metadataWorkspaceId;
    }

    if (params.subscriptionId) {
      const workspaceId = await this.findWorkspaceIdBySubscriptionId(
        params.executor,
        params.subscriptionId
      );
      if (workspaceId) {
        return workspaceId;
      }
    }

    if (!params.customerId) {
      return null;
    }
    return this.findWorkspaceIdByCustomerId(params.executor, params.customerId);
  }

  private async upsertStripeCustomer(
    executor: QueryExecutor,
    workspaceId: string,
    customerId: string
  ) {
    await executor.query(
      `
        INSERT INTO billing_customers (
          workspace_id,
          provider,
          provider_customer_id,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, now(), now())
        ON CONFLICT (workspace_id, provider)
        DO UPDATE SET
          provider_customer_id = EXCLUDED.provider_customer_id,
          updated_at = now();
      `,
      [workspaceId, BILLING_PROVIDER, customerId]
    );
  }

  private async upsertStripeSubscription(
    executor: QueryExecutor,
    snapshot: StripeSubscriptionSnapshot
  ) {
    await executor.query(
      `
        INSERT INTO billing_subscriptions (
          workspace_id,
          provider,
          provider_customer_id,
          provider_subscription_id,
          provider_price_id,
          status,
          cancel_at_period_end,
          current_period_start,
          current_period_end,
          metadata,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, now(), now())
        ON CONFLICT (workspace_id, provider)
        DO UPDATE SET
          provider_customer_id = EXCLUDED.provider_customer_id,
          provider_subscription_id = EXCLUDED.provider_subscription_id,
          provider_price_id = EXCLUDED.provider_price_id,
          status = EXCLUDED.status,
          cancel_at_period_end = EXCLUDED.cancel_at_period_end,
          current_period_start = EXCLUDED.current_period_start,
          current_period_end = EXCLUDED.current_period_end,
          metadata = EXCLUDED.metadata,
          updated_at = now();
      `,
      [
        snapshot.workspaceId,
        BILLING_PROVIDER,
        snapshot.customerId,
        snapshot.subscriptionId,
        snapshot.priceId,
        snapshot.status,
        snapshot.cancelAtPeriodEnd,
        snapshot.currentPeriodStart,
        snapshot.currentPeriodEnd,
        JSON.stringify(snapshot.metadata)
      ]
    );
  }

  private async upsertStripeInvoice(executor: QueryExecutor, snapshot: StripeInvoiceSnapshot) {
    await executor.query(
      `
        INSERT INTO billing_invoices (
          workspace_id,
          provider,
          provider_invoice_id,
          provider_customer_id,
          provider_subscription_id,
          status,
          amount_cents,
          currency,
          hosted_invoice_url,
          invoice_pdf_url,
          period_start,
          period_end,
          paid_at,
          metadata,
          created_at,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, now(), now()
        )
        ON CONFLICT (provider, provider_invoice_id)
        DO UPDATE SET
          workspace_id = EXCLUDED.workspace_id,
          provider_customer_id = EXCLUDED.provider_customer_id,
          provider_subscription_id = EXCLUDED.provider_subscription_id,
          status = EXCLUDED.status,
          amount_cents = EXCLUDED.amount_cents,
          currency = EXCLUDED.currency,
          hosted_invoice_url = EXCLUDED.hosted_invoice_url,
          invoice_pdf_url = EXCLUDED.invoice_pdf_url,
          period_start = EXCLUDED.period_start,
          period_end = EXCLUDED.period_end,
          paid_at = EXCLUDED.paid_at,
          metadata = EXCLUDED.metadata,
          updated_at = now();
      `,
      [
        snapshot.workspaceId,
        BILLING_PROVIDER,
        snapshot.invoiceId,
        snapshot.customerId,
        snapshot.subscriptionId,
        snapshot.status,
        snapshot.amountCents,
        snapshot.currency,
        snapshot.hostedInvoiceUrl,
        snapshot.invoicePdfUrl,
        snapshot.periodStart,
        snapshot.periodEnd,
        snapshot.paidAt,
        JSON.stringify(snapshot.metadata)
      ]
    );
  }

  private async registerStripeWebhookEvent(executor: QueryExecutor, event: Stripe.Event) {
    const result = await executor.query<{ id: string }>(
      `
        INSERT INTO billing_webhook_events (
          provider,
          event_id,
          event_type,
          payload,
          processed_at,
          created_at
        )
        VALUES ($1, $2, $3, $4::jsonb, now(), now())
        ON CONFLICT (provider, event_id) DO NOTHING
        RETURNING id;
      `,
      [BILLING_PROVIDER, event.id, event.type, JSON.stringify(event)]
    );

    return Boolean(result.rows[0]);
  }

  private async handleStripeCheckoutCompleted(
    executor: QueryExecutor,
    session: Stripe.Checkout.Session
  ) {
    if (session.mode !== "subscription") {
      return;
    }

    const metadataWorkspaceId = workspaceIdFromMetadata(session.metadata);
    const referenceWorkspaceId =
      typeof session.client_reference_id === "string" && isUuid(session.client_reference_id)
        ? session.client_reference_id
        : null;
    const customerId = normalizeExpandableId(session.customer);
    const subscriptionId = normalizeExpandableId(session.subscription);
    const workspaceId =
      metadataWorkspaceId ??
      referenceWorkspaceId ??
      (customerId ? await this.findWorkspaceIdByCustomerId(executor, customerId) : null);

    if (!workspaceId || !customerId) {
      return;
    }

    await this.upsertStripeCustomer(executor, workspaceId, customerId);
    await this.upsertStripeSubscription(executor, {
      workspaceId,
      customerId,
      subscriptionId,
      priceId: null,
      status: "checkout_completed",
      cancelAtPeriodEnd: false,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      metadata: toSafeJsonObject(session.metadata)
    });
  }

  private async handleStripeSubscriptionEvent(
    executor: QueryExecutor,
    subscription: Stripe.Subscription
  ) {
    const customerId = normalizeExpandableId(subscription.customer);
    if (!customerId) {
      return;
    }

    const workspaceId = await this.resolveWorkspaceIdForSubscription({
      executor,
      metadataWorkspaceId: workspaceIdFromMetadata(subscription.metadata),
      subscriptionId: subscription.id,
      customerId
    });
    if (!workspaceId) {
      return;
    }

    await this.upsertStripeCustomer(executor, workspaceId, customerId);
    await this.upsertStripeSubscription(executor, {
      workspaceId,
      customerId,
      subscriptionId: subscription.id,
      priceId: firstStripePriceId(subscription),
      status: subscription.status,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      currentPeriodStart: stripeTimestampToDate(subscription.current_period_start),
      currentPeriodEnd: stripeTimestampToDate(subscription.current_period_end),
      metadata: toSafeJsonObject(subscription.metadata)
    });
  }

  private async handleStripeInvoiceEvent(executor: QueryExecutor, invoice: Stripe.Invoice) {
    const customerId = normalizeExpandableId(invoice.customer);
    if (!customerId) {
      return;
    }

    const subscriptionId = normalizeExpandableId(invoice.subscription);
    const workspaceId = await this.resolveWorkspaceIdForSubscription({
      executor,
      metadataWorkspaceId: workspaceIdFromMetadata(invoice.metadata),
      subscriptionId,
      customerId
    });
    if (!workspaceId) {
      return;
    }

    const firstLine = invoice.lines.data[0];
    const linePeriodStart = stripeTimestampToDate(firstLine?.period?.start);
    const linePeriodEnd = stripeTimestampToDate(firstLine?.period?.end);

    await this.upsertStripeCustomer(executor, workspaceId, customerId);
    await this.upsertStripeInvoice(executor, {
      workspaceId,
      customerId,
      subscriptionId,
      invoiceId: invoice.id,
      status: invoice.status ?? "unknown",
      amountCents: invoice.amount_paid || invoice.amount_due || 0,
      currency: invoice.currency ?? null,
      hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
      invoicePdfUrl: invoice.invoice_pdf ?? null,
      periodStart: linePeriodStart,
      periodEnd: linePeriodEnd,
      paidAt: stripeTimestampToDate(invoice.status_transitions?.paid_at),
      metadata: toSafeJsonObject(invoice.metadata)
    });
  }

  private async applyStripeWebhookEvent(executor: QueryExecutor, event: Stripe.Event) {
    if (event.type === "checkout.session.completed") {
      await this.handleStripeCheckoutCompleted(
        executor,
        event.data.object as Stripe.Checkout.Session
      );
      return;
    }

    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      await this.handleStripeSubscriptionEvent(executor, event.data.object as Stripe.Subscription);
      return;
    }

    if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
      await this.handleStripeInvoiceEvent(executor, event.data.object as Stripe.Invoice);
    }
  }

  private async processStripeWebhookEvent(event: Stripe.Event) {
    const client = await this.dbPool().connect();

    try {
      await client.query("BEGIN");
      const isNewEvent = await this.registerStripeWebhookEvent(client, event);
      const isDuplicateEvent = !isNewEvent;
      if (isDuplicateEvent) {
        await client.query("COMMIT");
        return true;
      }

      await this.applyStripeWebhookEvent(client, event);
      await client.query("COMMIT");
      return false;
    } catch (error) {
      billingLogger.warn(`stripe webhook processing failed for event ${event.id} (${event.type})`);
      try {
        await client.query("ROLLBACK");
      } catch {
        // Keep original error when rollback fails.
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async getWorkspaceMetering(
    workspaceId: string,
    reference = new Date()
  ): Promise<WorkspaceMetering> {
    const pool = this.dbPool();
    const { periodStart, periodEnd } = monthRange(reference);
    const planKey = await this.resolveEffectivePlanKey(workspaceId, pool);
    const { monthlyGenerationLimit } = planConfigFor(planKey);
    const usedUnits = await this.monthlyUsage({
      workspaceId,
      eventType: GENERATION_EVENT_TYPE,
      periodStart,
      periodEnd,
      executor: pool
    });
    const [billing, latestInvoice] = await Promise.all([
      this.loadWorkspaceBillingSummary(workspaceId, pool),
      this.loadWorkspaceLatestInvoice(workspaceId, pool)
    ]);

    return {
      planKey,
      monthlyGenerationLimit,
      usedUnits,
      remainingUnits:
        monthlyGenerationLimit === null ? null : Math.max(0, monthlyGenerationLimit - usedUnits),
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      billing,
      latestInvoice
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
    const planKey = await this.resolveEffectivePlanKey(workspaceId, executor);
    const { monthlyGenerationLimit } = planConfigFor(planKey);
    const usedUnits = await this.monthlyUsage({
      workspaceId,
      eventType: GENERATION_EVENT_TYPE,
      periodStart,
      periodEnd,
      executor
    });

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

  async createCheckoutSession(params: CheckoutSessionParams) {
    if (!CHECKOUT_PLAN_KEYS.includes(params.planKey)) {
      throw new BadRequestException("Unsupported plan key");
    }

    const stripe = this.requireStripeClient();
    await this.resolveWorkspacePlanKey(params.workspaceId, this.dbPool());

    const priceId = this.resolveCheckoutPriceId(params.planKey);
    if (!priceId) {
      throw new ServiceUnavailableException(
        `Stripe price is not configured for plan '${params.planKey}'`
      );
    }

    const appBaseUrl = defaultAppBaseUrl();
    const successUrl = params.successUrl ?? `${appBaseUrl}/studio?view=settings&billing=success`;
    const cancelUrl = params.cancelUrl ?? `${appBaseUrl}/studio?view=settings&billing=cancel`;
    const customerId = await this.findStripeCustomerIdByWorkspace(
      this.dbPool(),
      params.workspaceId
    );

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: params.workspaceId,
      metadata: { workspaceId: params.workspaceId },
      subscription_data: { metadata: { workspaceId: params.workspaceId } },
      line_items: [{ price: priceId, quantity: 1 }],
      customer: customerId ?? undefined
    });

    if (!session.url) {
      throw new HttpException("Stripe checkout session URL is missing", HttpStatus.BAD_GATEWAY);
    }

    return {
      sessionId: session.id,
      url: session.url
    };
  }

  async createPortalSession(params: PortalSessionParams) {
    const stripe = this.requireStripeClient();
    await this.resolveWorkspacePlanKey(params.workspaceId, this.dbPool());

    const customerId = await this.findStripeCustomerIdByWorkspace(
      this.dbPool(),
      params.workspaceId
    );
    if (!customerId) {
      throw new BadRequestException("Workspace has no Stripe customer yet");
    }

    const appBaseUrl = defaultAppBaseUrl();
    const request: Stripe.BillingPortal.SessionCreateParams = {
      customer: customerId,
      return_url: params.returnUrl ?? `${appBaseUrl}/studio?view=settings`
    };

    const configurationId = this.stripePortalConfigurationId();
    if (configurationId) {
      request.configuration = configurationId;
    }

    const session = await stripe.billingPortal.sessions.create(request);
    return { url: session.url };
  }

  async handleStripeWebhook(
    rawBody: Buffer | string | undefined,
    signatureHeader: string | undefined
  ): Promise<StripeWebhookResponse> {
    if (!signatureHeader) {
      throw new BadRequestException("Missing Stripe signature header");
    }
    if (!rawBody) {
      throw new BadRequestException("Missing Stripe webhook raw body");
    }

    const stripe = this.requireStripeClient();
    const webhookSecret = this.requireStripeWebhookSecret();

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signatureHeader, webhookSecret);
    } catch {
      throw new BadRequestException("Invalid Stripe webhook signature");
    }

    const duplicate = await this.processStripeWebhookEvent(event);
    return {
      ok: true,
      duplicate,
      eventId: event.id
    };
  }

  newTransactionExecutor(client: PoolClient): QueryExecutor {
    return client;
  }
}
