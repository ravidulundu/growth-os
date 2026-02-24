import { useState } from "react";
import {
  type MagicLinkRequestResponse,
  type StartConnectResponse,
  completeXConnect,
  requestMagicLink,
  startXConnect
} from "../../../lib/api";
import { trackWebEvent } from "../../../lib/telemetry";
import type { NotifyStudioError, RunStudioAction } from "./types";

type UseStudioAuthParams = {
  workspaceId: string;
  setSelectedAccountId: (accountId: string) => void;
  runAction: RunStudioAction;
  notifyError: NotifyStudioError;
};

export function useStudioAuth(params: UseStudioAuthParams) {
  const [email, setEmail] = useState("founder@example.com");
  const [oauthCode, setOauthCode] = useState("mock-auth-code");
  const [magicRequestResult, setMagicRequestResult] = useState<MagicLinkRequestResponse | null>(
    null
  );
  const [connectStartResult, setConnectStartResult] = useState<StartConnectResponse | null>(null);

  const handleRequestMagicLink = async () => {
    await params.runAction("Request Magic Link", async () => {
      const origin = window.location.origin;
      const result = await requestMagicLink(email.trim(), {
        callbackURL: `${origin}/studio`,
        newUserCallbackURL: `${origin}/studio`,
        errorCallbackURL: `${origin}/login?error=magic_link`
      });
      setMagicRequestResult(result);
      return result;
    });
  };

  const handleStartConnect = async () => {
    if (!params.workspaceId) {
      params.notifyError("Workspace ID is required.");
      return;
    }

    const result = await params.runAction("Start X Connect", async () => {
      const result = await startXConnect(params.workspaceId);
      setConnectStartResult(result);
      return result;
    });

    if (result) {
      trackWebEvent(
        "x_connect_started",
        { flow: "oauth_pkce" },
        { workspaceId: params.workspaceId, critical: true }
      );
    }
  };

  const handleCompleteConnect = async () => {
    if (!params.workspaceId || !connectStartResult?.state || !oauthCode) {
      params.notifyError("Workspace, OAuth state and code are required.");
      return;
    }

    const result = await params.runAction("Complete X Connect", async () => {
      const result = await completeXConnect(
        params.workspaceId,
        connectStartResult.state,
        oauthCode
      );
      params.setSelectedAccountId(result.accountId);
      return result;
    });

    if (result) {
      trackWebEvent(
        "x_connect_completed",
        { accountId: result.accountId },
        { workspaceId: params.workspaceId, critical: true }
      );
    }
  };

  return {
    email,
    setEmail,
    oauthCode,
    setOauthCode,
    magicRequestResult,
    connectStartResult,
    handleRequestMagicLink,
    handleStartConnect,
    handleCompleteConnect
  };
}
