"use client";

import { useState } from "react";

type RequestResult = {
  ok: boolean;
  magicLink?: string;
  message?: string;
};

export default function LoginPage() {
  const [email, setEmail] = useState("founder@example.com");
  const [result, setResult] = useState<RequestResult | null>(null);
  const [loading, setLoading] = useState(false);

  const requestMagicLink = async () => {
    setLoading(true);
    setResult(null);
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

    try {
      const res = await fetch(`${apiUrl}/auth/magic-link/request`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email })
      });
      const data = (await res.json()) as RequestResult;
      setResult(data);
    } catch {
      setResult({ ok: false, message: "API request failed" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-semibold">Magic Link Stub</h1>
      <p className="mt-2 text-sm text-slate-600">
        This sends a stub magic link response from the API.
      </p>

      <div className="mt-6 space-y-3">
        <label className="block text-sm font-medium" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          className="w-full rounded border border-slate-300 px-3 py-2"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button
          className="rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-60"
          disabled={loading}
          onClick={requestMagicLink}
          type="button"
        >
          {loading ? "Sending..." : "Request Magic Link"}
        </button>
      </div>

      {result ? (
        <pre className="mt-6 overflow-x-auto rounded bg-slate-100 p-3 text-xs">
          {JSON.stringify(result, null, 2)}
        </pre>
      ) : null}
    </main>
  );
}
