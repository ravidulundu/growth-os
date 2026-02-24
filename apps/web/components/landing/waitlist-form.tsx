"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { joinWaitlist } from "../../lib/api";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

type Notice = {
  tone: "success" | "error";
  text: string;
};

function NoticeBlock({ notice }: { notice: Notice | null }) {
  if (!notice) {
    return null;
  }

  const toneClass =
    notice.tone === "success"
      ? "border-emerald-300 bg-emerald-100 text-emerald-800"
      : "border-red-300 bg-red-100 text-red-800";

  return (
    <p className={`rounded-lg border px-3 py-2 text-sm ${toneClass}`} aria-live="polite">
      {notice.text}
    </p>
  );
}

export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submitDisabled = submitting || email.trim().length < 5;

  const handleSubmit = async () => {
    setSubmitting(true);
    setNotice(null);

    try {
      const result = await joinWaitlist(email.trim(), "landing");
      setNotice({ tone: "success", text: result.message });
      if (!result.alreadyJoined) {
        setEmail("");
      }
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Failed to join waitlist."
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="motion-rise border-[var(--border)] bg-[var(--card)]/90">
      <CardHeader>
        <CardTitle className="font-display text-2xl">Join the Waitlist</CardTitle>
        <CardDescription>
          Get product updates, early templates, and onboarding drops.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="waitlist-email">Email</Label>
          <Input
            id="waitlist-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@domain.com"
          />
        </div>
        <Button onClick={() => void handleSubmit()} disabled={submitDisabled}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Join Waitlist
        </Button>
        <NoticeBlock notice={notice} />
      </CardContent>
    </Card>
  );
}
