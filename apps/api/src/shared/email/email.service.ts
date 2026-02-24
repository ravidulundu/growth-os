import { Logger } from "@nestjs/common";
import nodemailer from "nodemailer";

export type SendEmailOptions = {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  from?: string;
  logContext?: string;
};

export type SendMagicLinkEmailOptions = {
  email: string;
  deliveryUrl: string;
  subject?: string;
  text?: string;
  logContext?: string;
};

function canLogMagicLinkToConsole() {
  return process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
}

function canLogFullMagicLinkToConsole() {
  return (process.env.AUTH_DEV_LOG_MAGIC_LINK_URL ?? "false").toLowerCase() === "true";
}

function resolveSmtpHost() {
  return process.env.SMTP_HOST?.trim();
}

function resolveSmtpPort() {
  const smtpPortRaw = Number(process.env.SMTP_PORT ?? 587);
  return Number.isFinite(smtpPortRaw) && smtpPortRaw > 0 ? smtpPortRaw : 587;
}

function resolveFromEmail() {
  return process.env.MAGIC_LINK_FROM_EMAIL ?? "no-reply@example.com";
}

function logDevMagicLink(options: SendMagicLinkEmailOptions) {
  const { email, deliveryUrl, logContext = "EmailService" } = options;
  if (canLogFullMagicLinkToConsole()) {
    Logger.log(`[auth] dev magic link for ${email}: ${deliveryUrl}`, logContext);
    return;
  }

  Logger.log(
    `[auth] dev magic link generated for ${email}. Set AUTH_DEV_LOG_MAGIC_LINK_URL=true to print full URL.`,
    logContext
  );
}

function buildSmtpTransport() {
  const smtpHost = resolveSmtpHost();
  if (!smtpHost) {
    return null;
  }

  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  return nodemailer.createTransport({
    host: smtpHost,
    port: resolveSmtpPort(),
    secure: false,
    auth: smtpUser && smtpPass ? { user: smtpUser, pass: smtpPass } : undefined
  });
}

export async function sendEmail({
  to,
  subject,
  text,
  html,
  from,
  logContext = "EmailService"
}: SendEmailOptions) {
  const transporter = buildSmtpTransport();
  if (!transporter) {
    if (!canLogMagicLinkToConsole()) {
      throw new Error("Email delivery is not configured");
    }

    Logger.log(`[email] dev email generated for ${to}: ${subject}`, logContext);
    return;
  }

  await transporter
    .sendMail({
      from: from ?? resolveFromEmail(),
      to,
      subject,
      text,
      html
    })
    .then((info) => {
      const responseText =
        typeof info.response === "string" && info.response.trim().length > 0
          ? info.response
          : info.messageId;
      Logger.log(
        `[email] SMTP accepted message for ${to} (${responseText ?? "no-response"})`,
        logContext
      );
    })
    .catch((error) => {
      Logger.warn(
        `[email] SMTP send failed for ${to}: ${error instanceof Error ? error.message : String(error)}`,
        logContext
      );
      throw error;
    });
}

export async function sendMagicLinkEmail(options: SendMagicLinkEmailOptions) {
  const smtpHost = resolveSmtpHost();
  if (!smtpHost) {
    if (!canLogMagicLinkToConsole()) {
      throw new Error("Magic link delivery is not configured");
    }

    logDevMagicLink(options);
    return;
  }

  try {
    await sendEmail({
      to: options.email,
      subject: options.subject ?? "Your Growth OS magic link",
      text: options.text ?? `Use this link to sign in: ${options.deliveryUrl}`,
      logContext: options.logContext ?? "EmailService"
    });
  } catch (error) {
    if (!canLogMagicLinkToConsole()) {
      throw error;
    }

    Logger.warn(
      `[auth] SMTP unavailable in ${process.env.NODE_ENV ?? "unknown"}; falling back to dev magic link logging.`,
      options.logContext ?? "EmailService"
    );
    logDevMagicLink(options);
  }
}
