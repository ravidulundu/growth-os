import { AsyncLocalStorage } from "node:async_hooks";

type RequestContextStore = {
  requestId: string;
};

export const requestContextStorage = new AsyncLocalStorage<RequestContextStore>();

export function getRequestId() {
  return requestContextStorage.getStore()?.requestId ?? "unknown";
}
