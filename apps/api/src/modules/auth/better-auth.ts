import { createHash, randomUUID } from "node:crypto";
import { sendMagicLinkEmail } from "../../shared/email/email.service";
import {
  resolveAuthCookieSameSiteLowercase,
  resolveAuthCookieSecure
} from "../../shared/auth/cookie-policy";
import { getPool } from "../../shared/db/pool";
import { resolveAppOrigins } from "../../shared/http/origin-utils";
import { isUuid } from "../../shared/validation/uuid";

type SignInMagicLinkInput = {
  body: {
    email: string;
    name?: string;
    callbackURL?: string;
    newUserCallbackURL?: string;
    errorCallbackURL?: string;
  };
  headers: Headers;
};

type SignInMagicLinkOutput = {
  status: boolean;
};

type MagicLinkVerifyInput = {
  query: {
    token: string;
    callbackURL?: string;
    newUserCallbackURL?: string;
    errorCallbackURL?: string;
  };
  headers: Headers;
};

type MagicLinkVerifyOutput = {
  token: string;
  user: {
    id: string;
  };
};

type BetterAuthApi = {
  signInMagicLink(input: SignInMagicLinkInput): Promise<SignInMagicLinkOutput>;
  magicLinkVerify(input: MagicLinkVerifyInput): Promise<MagicLinkVerifyOutput>;
};

type BetterAuthInstance = {
  api: BetterAuthApi;
};

function resolveAuthSecret() {
  const configured =
    process.env.BETTER_AUTH_SECRET?.trim() ||
    process.env.AUTH_SECRET?.trim() ||
    process.env.JWT_SECRET?.trim();

  if (configured) {
    return configured;
  }

  const env = process.env.NODE_ENV?.trim().toLowerCase();
  if (env === "production" || env === "staging") {
    throw new Error("Missing BETTER_AUTH_SECRET or AUTH_SECRET for Better Auth");
  }

  return "better-auth-dev-secret-change-me";
}

function resolveAuthBaseUrl() {
  const candidates = [
    process.env.BETTER_AUTH_BASE_URL,
    process.env.API_URL,
    process.env.NEXT_PUBLIC_API_URL
  ];

  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (!value) {
      continue;
    }

    if (value.startsWith("http://") || value.startsWith("https://")) {
      return value.replace(/\/+$/, "");
    }
  }

  return "http://localhost:4000";
}

const LOCAL_TRUSTED_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3010",
  "http://127.0.0.1:3010"
];

export function resolveTrustedOrigins() {
  const configured = process.env.CORS_ALLOWED_ORIGINS?.trim();
  if (configured) {
    return configured
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean);
  }

  return resolveAppOrigins(process.env.APP_URL, LOCAL_TRUSTED_ORIGINS);
}

function computeEmailHash(email: string) {
  return createHash("sha256").update(email.toLowerCase().trim()).digest("hex");
}

function resolveAppUrl() {
  const configured = process.env.APP_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  return "http://localhost:3010";
}

function buildLoginVerificationUrl(rawMagicLinkUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(rawMagicLinkUrl);
  } catch {
    return rawMagicLinkUrl;
  }

  const token = parsed.searchParams.get("token");
  if (!token) {
    return rawMagicLinkUrl;
  }

  const callback =
    parsed.searchParams.get("callbackURL") ?? parsed.searchParams.get("newUserCallbackURL");
  const webLoginUrl = new URL("/login", resolveAppUrl());
  webLoginUrl.searchParams.set("magic_token", token);
  if (callback) {
    webLoginUrl.searchParams.set("next", callback);
  }

  return webLoginUrl.toString();
}

function resolveMagicLinkMaxRequestsPerHour() {
  const maxRequestsRaw = Number(process.env.AUTH_MAGIC_LINK_MAX_REQUESTS_PER_HOUR ?? 5);
  return Number.isFinite(maxRequestsRaw) && maxRequestsRaw > 0 ? maxRequestsRaw : 5;
}

function buildUserConfig() {
  return {
    modelName: "users",
    fields: {
      createdAt: "created_at",
      updatedAt: "updated_at",
      emailVerified: "email_verified",
      name: "display_name",
      image: "avatar_url"
    },
    additionalFields: {
      emailHash: {
        type: "string" as const,
        fieldName: "email_hash",
        required: true,
        input: false,
        returned: false
      }
    }
  };
}

function buildSessionConfig() {
  return {
    modelName: "better_auth_sessions",
    fields: {
      createdAt: "created_at",
      updatedAt: "updated_at",
      userId: "user_id",
      expiresAt: "expires_at",
      ipAddress: "ip_address",
      userAgent: "user_agent"
    },
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60
  };
}

function buildAccountConfig() {
  return {
    modelName: "better_auth_accounts",
    fields: {
      createdAt: "created_at",
      updatedAt: "updated_at",
      providerId: "provider_id",
      accountId: "account_id",
      userId: "user_id",
      accessToken: "access_token",
      refreshToken: "refresh_token",
      idToken: "id_token",
      accessTokenExpiresAt: "access_token_expires_at",
      refreshTokenExpiresAt: "refresh_token_expires_at"
    }
  };
}

function buildVerificationConfig() {
  return {
    modelName: "better_auth_verifications",
    fields: {
      createdAt: "created_at",
      updatedAt: "updated_at",
      expiresAt: "expires_at"
    }
  };
}

function buildAdvancedConfig() {
  return {
    cookies: {
      sessionToken: {
        name: "session_token",
        attributes: {
          httpOnly: true,
          secure: resolveAuthCookieSecure(),
          sameSite: resolveAuthCookieSameSiteLowercase(),
          path: "/"
        }
      }
    }
  };
}

function buildDatabaseHooks() {
  return {
    user: {
      create: {
        before: async (user: Record<string, unknown>) => {
          const emailValue = String(user.email ?? "");
          const generatedId =
            typeof user.id === "string" && isUuid(user.id) ? user.id : randomUUID();
          const derivedName =
            typeof user.name === "string" && user.name.trim().length > 0
              ? user.name.trim()
              : emailValue.split("@")[0] || "user";
          return {
            data: {
              ...user,
              id: generatedId,
              name: derivedName,
              emailHash: computeEmailHash(emailValue)
            }
          };
        }
      },
      update: {
        before: async (user: Record<string, unknown>) => {
          if (!user.email) {
            return;
          }

          const emailValue = String(user.email);
          return {
            data: {
              ...user,
              emailHash: computeEmailHash(emailValue)
            }
          };
        }
      }
    }
  };
}

function buildEmailConfig() {
  return {
    sendMagicLink: async ({ email, url }: { email: string; url: string }) => {
      const deliveryUrl = buildLoginVerificationUrl(url);
      await sendMagicLinkEmail({ email, deliveryUrl, logContext: "BetterAuth" });
    }
  };
}

type MagicLinkPluginFactory = (typeof import("better-auth/plugins/magic-link"))["magicLink"];

function buildPlugins(params: {
  magicLink: MagicLinkPluginFactory;
  maxRequestsPerHour: number;
  emailConfig: ReturnType<typeof buildEmailConfig>;
}) {
  return [
    params.magicLink({
      expiresIn: 60 * 15,
      storeToken: "hashed",
      rateLimit: {
        window: 60 * 60,
        max: params.maxRequestsPerHour
      },
      sendMagicLink: params.emailConfig.sendMagicLink
    })
  ];
}

let authInstancePromise: Promise<BetterAuthInstance> | null = null;

async function createBetterAuthInstance(): Promise<BetterAuthInstance> {
  const [{ betterAuth }, { magicLink }] = await Promise.all([
    import("better-auth"),
    import("better-auth/plugins/magic-link")
  ]);

  const emailConfig = buildEmailConfig();
  const auth = betterAuth({
    baseURL: resolveAuthBaseUrl(),
    basePath: "/auth",
    disabledPaths: ["/magic-link/request"],
    secret: resolveAuthSecret(),
    database: getPool(),
    trustedOrigins: resolveTrustedOrigins(),
    useSecureCookies: resolveAuthCookieSecure(),
    user: buildUserConfig(),
    session: buildSessionConfig(),
    account: buildAccountConfig(),
    verification: buildVerificationConfig(),
    advanced: buildAdvancedConfig(),
    databaseHooks: buildDatabaseHooks(),
    plugins: buildPlugins({
      magicLink,
      maxRequestsPerHour: resolveMagicLinkMaxRequestsPerHour(),
      emailConfig
    })
  });

  return auth as unknown as BetterAuthInstance;
}

export async function getBetterAuth() {
  if (!authInstancePromise) {
    // Better Auth is initialized once per process; config/env changes need restart.
    authInstancePromise = createBetterAuthInstance().catch((error) => {
      authInstancePromise = null;
      throw error;
    });
  }

  return authInstancePromise;
}
