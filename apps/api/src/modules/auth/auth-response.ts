export type MagicLinkRequestResponse = {
  ok: true;
  message: string;
};

export function buildMagicLinkRequestResponse(): MagicLinkRequestResponse {
  return {
    ok: true,
    message: "If the email is eligible, a magic link will be sent."
  };
}
