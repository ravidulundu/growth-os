import { useState } from "react";
import { listWorkspaceAccounts, type Account } from "../../../lib/api";
import type { NotifyStudioError, RunStudioAction } from "./types";

type UseStudioAccountsParams = {
  workspaceId: string;
  selectedAccountId: string;
  setSelectedAccountId: (accountId: string) => void;
  runAction: RunStudioAction;
  notifyError: NotifyStudioError;
};

export function useStudioAccounts(params: UseStudioAccountsParams) {
  const [accounts, setAccounts] = useState<Account[]>([]);

  const handleLoadAccounts = async () => {
    if (!params.workspaceId) {
      params.notifyError("Workspace ID is required.");
      return;
    }

    await params.runAction("Load Accounts", async () => {
      const result = await listWorkspaceAccounts(params.workspaceId);
      setAccounts(result);
      if (result[0] && !params.selectedAccountId) {
        params.setSelectedAccountId(result[0].id);
      }
      return result;
    });
  };

  return { accounts, handleLoadAccounts };
}
