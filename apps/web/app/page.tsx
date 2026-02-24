import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LandingPage } from "../components/landing/landing-page";

function normalizeAbsoluteHttpUrl(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  if (!/^https?:\/\//i.test(trimmed)) {
    return null;
  }

  return trimmed.replace(/\/+$/, "");
}

function resolveApiBaseUrl() {
  const serverConfigured = normalizeAbsoluteHttpUrl(process.env.API_URL);
  if (serverConfigured) {
    return serverConfigured;
  }

  const publicConfigured = normalizeAbsoluteHttpUrl(process.env.NEXT_PUBLIC_API_URL);
  if (publicConfigured) {
    return publicConfigured;
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
      headers: { cookie: cookieHeader }
    });
    return response.ok;
  } catch {
    return false;
  }
}

export default async function HomePage() {
  const sessionValid = await hasValidSession();
  if (sessionValid) {
    redirect("/studio");
  }

  return <LandingPage />;
}
