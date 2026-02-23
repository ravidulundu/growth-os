import type { LucideIcon } from "lucide-react";

export type ContentMode = "tweet" | "thread" | "reply" | "quote";
export type StudioView =
  | "dashboard"
  | "generator"
  | "library"
  | "scheduler"
  | "analytics"
  | "settings";

export type Notice = {
  tone: "success" | "error";
  text: string;
};

export type ActivityEntry = {
  id: string;
  text: string;
};

export type StudioStat = {
  label: string;
  value: string;
  icon: LucideIcon;
  tone: "success" | "warning" | "neutral";
};

export type StudioSection = {
  id: StudioView;
  label: string;
  icon: LucideIcon;
};
