"use client";

import Link from "next/link";
import { useEffect, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { requestMagicLink, verifyMagicLink } from "../../lib/api";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";

type Notice = {
  tone: "success" | "error";
  text: string;
};

type ActiveAction = "request" | "verify" | null;
type SetActiveAction = Dispatch<SetStateAction<ActiveAction>>;
type SetNotice = Dispatch<SetStateAction<Notice | null>>;

function resolveSafeNextPath(rawNext: string | null, origin: string) {
  if (!rawNext) {
    return "/studio";
  }

  try {
    const parsed = new URL(rawNext, origin);
    if (parsed.origin !== origin) {
      return "/studio";
    }

    const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    return path.length > 0 ? path : "/studio";
  } catch {
    return "/studio";
  }
}

function useLoginBootstrap(
  router: ReturnType<typeof useRouter>,
  setActiveAction: SetActiveAction,
  setNotice: SetNotice
) {
  useEffect(() => {
    let cancelled = false;
    const origin = window.location.origin;
    const params = new URLSearchParams(window.location.search);
    const token = params.get("magic_token");
    const nextPath = resolveSafeNextPath(params.get("next"), origin);

    if (token) {
      setActiveAction("verify");
      setNotice({ tone: "success", text: "Magic link doğrulanıyor..." });
      void verifyMagicLink(token)
        .then(() => {
          if (cancelled) {
            return;
          }
          setNotice({ tone: "success", text: "Login başarılı. Yönlendiriliyorsun..." });
          window.location.replace(nextPath);
        })
        .catch((error) => {
          if (cancelled) {
            return;
          }
          setNotice({
            tone: "error",
            text: error instanceof Error ? error.message : "Magic link doğrulanamadı."
          });
        })
        .finally(() => {
          if (!cancelled) {
            setActiveAction(null);
          }
        });

      return () => {
        cancelled = true;
      };
    }

    const validateSession = async () => {
      try {
        const response = await fetch("/api/auth/session", {
          method: "GET",
          credentials: "include",
          cache: "no-store"
        });
        if (response.ok && !cancelled) {
          router.replace("/studio");
        }
      } catch {
        // Ignore connectivity errors and keep the user on login page.
      }
    };

    void validateSession();

    return () => {
      cancelled = true;
    };
  }, [router, setActiveAction, setNotice]);
}

async function requestLoginNotice(email: string): Promise<Notice> {
  const origin = window.location.origin;
  const result = await requestMagicLink(email.trim(), {
    callbackURL: `${origin}/studio`,
    newUserCallbackURL: `${origin}/studio`,
    errorCallbackURL: `${origin}/login?error=magic_link`
  });

  return {
    tone: result.ok ? "success" : "error",
    text: result.ok
      ? "Magic link gönderildi. E-postadaki linke tıklayın, otomatik giriş yapılacak."
      : result.message
  };
}

function LoginNotice({ notice }: { notice: Notice | null }) {
  if (!notice) {
    return null;
  }

  const noticeClassName =
    notice.tone === "error"
      ? "rounded-lg border border-red-300 bg-red-100 px-3 py-2 text-sm text-red-700"
      : "rounded-lg border border-emerald-300 bg-emerald-100 px-3 py-2 text-sm text-emerald-700";

  return (
    <div data-testid="login-notice" className={noticeClassName} aria-live="polite">
      {notice.text}
    </div>
  );
}

type LoginRequestFormProps = {
  email: string;
  requestDisabled: boolean;
  showSpinner: boolean;
  onEmailChange: (value: string) => void;
  onSubmit: () => Promise<void>;
};

function LoginRequestForm({
  email,
  requestDisabled,
  showSpinner,
  onEmailChange,
  onSubmit
}: LoginRequestFormProps) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void onSubmit();
  };

  return (
    <form className="space-y-3" onSubmit={handleSubmit}>
      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          data-testid="login-email-input"
          value={email}
          onChange={(event) => onEmailChange(event.target.value)}
        />
      </div>
      <Button type="submit" disabled={requestDisabled} data-testid="request-magic-link-button">
        {showSpinner ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Request Magic Link
      </Button>
    </form>
  );
}

function LoginCardFooter() {
  return (
    <CardFooter className="justify-between text-sm text-[var(--muted-foreground)]">
      <span>Session: waiting for email verification</span>
      <Link className="font-semibold text-[var(--secondary)] hover:underline" href="/studio">
        Go to Studio
      </Link>
    </CardFooter>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("founder@example.com");
  const [activeAction, setActiveAction] = useState<ActiveAction>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  useLoginBootstrap(router, setActiveAction, setNotice);

  const requestDisabled = activeAction !== null || email.trim().length < 5;

  const runRequest = async () => {
    setActiveAction("request");
    setNotice(null);
    try {
      setNotice(await requestLoginNotice(email));
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Magic link request failed."
      });
    } finally {
      setActiveAction(null);
    }
  };

  return (
    <main id="main-content" className="mx-auto w-full max-w-2xl px-4 pb-14 pt-10 sm:px-6">
      <Card className="motion-rise">
        <CardHeader>
          <CardTitle className="font-display text-3xl">Magic Link Login</CardTitle>
          <CardDescription>
            E-posta adresini gir, linki iste, e-postadaki linke tıkla. Doğrulama sonrası oturum
            cookie&apos;si otomatik set edilir.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <LoginNotice notice={notice} />
          <LoginRequestForm
            email={email}
            requestDisabled={requestDisabled}
            showSpinner={activeAction !== null}
            onEmailChange={setEmail}
            onSubmit={runRequest}
          />
        </CardContent>

        <LoginCardFooter />
      </Card>
    </main>
  );
}
