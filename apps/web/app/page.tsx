import Link from "next/link";

async function fetchHealth() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
  try {
    const res = await fetch(`${apiUrl}/health`, { cache: "no-store" });
    if (!res.ok) {
      return { ok: false, status: res.status };
    }
    return await res.json();
  } catch {
    return { ok: false, status: "unreachable" };
  }
}

export default async function HomePage() {
  const health = await fetchHealth();

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-3xl font-semibold">Growth OS - Setup Complete</h1>
      <p className="mt-3 text-sm text-slate-600">
        Monorepo skeleton is running with web + API + DB migration infrastructure.
      </p>

      <section className="mt-8 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-medium">API Healthcheck</h2>
        <pre className="mt-3 overflow-x-auto rounded bg-slate-50 p-3 text-xs">
          {JSON.stringify(health, null, 2)}
        </pre>
      </section>

      <section className="mt-6">
        <Link className="text-sm text-blue-700 underline" href="/login">
          Go to Magic Link Stub
        </Link>
      </section>
    </main>
  );
}
