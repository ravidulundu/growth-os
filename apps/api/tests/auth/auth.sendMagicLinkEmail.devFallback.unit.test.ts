import assert from "node:assert/strict";
import test from "node:test";
import { Logger } from "@nestjs/common";
import nodemailer from "nodemailer";
import { sendMagicLinkEmail } from "../../src/shared/email/email.service";

test("auth.sendMagicLinkEmail.devFallback.unit", async () => {
  const envSnapshot = {
    NODE_ENV: process.env.NODE_ENV,
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    AUTH_DEV_LOG_MAGIC_LINK_URL: process.env.AUTH_DEV_LOG_MAGIC_LINK_URL
  };
  const originalCreateTransport = nodemailer.createTransport;
  const originalWarn = Logger.warn;
  const originalLog = Logger.log;
  const warnMessages: string[] = [];
  const logMessages: string[] = [];

  process.env.NODE_ENV = "development";
  process.env.SMTP_HOST = "smtp.invalid.local";
  process.env.SMTP_PORT = "587";
  process.env.AUTH_DEV_LOG_MAGIC_LINK_URL = "true";

  (
    nodemailer as unknown as { createTransport: typeof nodemailer.createTransport }
  ).createTransport = () =>
    ({
      sendMail: async () => {
        throw new Error("smtp failed");
      }
    }) as never;
  Logger.warn = ((message: unknown) => {
    warnMessages.push(String(message));
  }) as typeof Logger.warn;
  Logger.log = ((message: unknown) => {
    logMessages.push(String(message));
  }) as typeof Logger.log;

  try {
    await assert.doesNotReject(async () => {
      await sendMagicLinkEmail({
        email: "founder@example.com",
        deliveryUrl: "http://localhost:3010/login?magic_token=test-token",
        logContext: "AuthTest"
      });
    });
  } finally {
    (
      nodemailer as unknown as { createTransport: typeof nodemailer.createTransport }
    ).createTransport = originalCreateTransport;
    Logger.warn = originalWarn;
    Logger.log = originalLog;
    process.env.NODE_ENV = envSnapshot.NODE_ENV;
    process.env.SMTP_HOST = envSnapshot.SMTP_HOST;
    process.env.SMTP_PORT = envSnapshot.SMTP_PORT;
    process.env.AUTH_DEV_LOG_MAGIC_LINK_URL = envSnapshot.AUTH_DEV_LOG_MAGIC_LINK_URL;
  }

  assert.equal(
    warnMessages.some((message) => message.includes("falling back to dev magic link logging")),
    true
  );
  assert.equal(
    logMessages.some((message) => message.includes("[auth] dev magic link")),
    true
  );
});
