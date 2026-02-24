"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { initWebTelemetry } from "../lib/telemetry";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  useEffect(() => {
    initWebTelemetry();
  }, []);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
