import type { Notice } from "../types";

export type RunStudioAction = <T>(label: string, action: () => Promise<T>) => Promise<T | null>;

export type NotifyStudioError = (message: string) => void;

export type SetStudioNotice = (notice: Notice | null) => void;
