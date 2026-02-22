import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { StudioApp } from "../components/studio-app";

function resolveApiBaseUrl() {
  const configured = process.env.API_URL?.trim() || process.env.NEXT_PUBLIC_API_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  return "http://localhost:4000";
}

async function hasValidSession() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  if (!cookieHeader) {
    return false;
  }

  try {
    const response = await fetch(`${resolveApiBaseUrl()}/auth/session`, {
      method: "GET",
      cache: "no-store",
      headers: {
        cookie: cookieHeader
      }
    });
    return response.ok;
  } catch {
    return false;
  }
}

export default async function HomePage() {
  const sessionValid = await hasValidSession();
  if (!sessionValid) {
    redirect("/login");
  }

  return <StudioApp />;
}
