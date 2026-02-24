import Link from "next/link";
import { ArrowRight, ChartNoAxesCombined, Sparkles, TimerReset } from "lucide-react";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { WaitlistForm } from "./waitlist-form";

function LandingHero() {
  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-[var(--border)] bg-[var(--card)]/90 p-8 shadow-[0_20px_70px_rgba(23,26,40,0.12)] sm:p-12">
      <div className="absolute -right-14 -top-14 h-44 w-44 rounded-full bg-[var(--primary)]/25 blur-3xl" />
      <div className="absolute -bottom-16 -left-8 h-40 w-40 rounded-full bg-[var(--secondary)]/20 blur-3xl" />
      <p className="mb-4 inline-flex rounded-full border border-[var(--border)] bg-[var(--background)]/80 px-4 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
        Growth OS for X Creators
      </p>
      <h1 className="font-display text-4xl text-[var(--foreground)] sm:text-6xl">
        Build, ship, and learn from every post in one command center.
      </h1>
      <p className="mt-5 max-w-2xl text-base text-[var(--muted-foreground)] sm:text-lg">
        Connect your X account, extract style DNA, generate drafts, schedule delivery, and monitor
        first-hour performance without context switching.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/login?next=/studio">
            Get Started <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
        <Button variant="secondary" asChild>
          <Link href="/studio">Open Studio</Link>
        </Button>
      </div>
    </section>
  );
}

function FeatureRail() {
  const features = [
    {
      title: "Style extraction",
      description: "LLM + heuristic profile that keeps your voice consistent.",
      icon: Sparkles
    },
    {
      title: "First-hour alerts",
      description: "Catch weak posts early and react before momentum dies.",
      icon: TimerReset
    },
    {
      title: "Performance loops",
      description: "Tie content generation directly to measured outcomes.",
      icon: ChartNoAxesCombined
    }
  ];

  return (
    <section className="grid gap-4 md:grid-cols-3">
      {features.map((feature) => (
        <Card
          key={feature.title}
          className="motion-rise border-[var(--border)] bg-[var(--card)]/80"
        >
          <CardContent className="p-5">
            <feature.icon className="mb-3 h-5 w-5 text-[var(--primary)]" />
            <h2 className="font-display text-xl text-[var(--foreground)]">{feature.title}</h2>
            <p className="mt-2 text-sm text-[var(--muted-foreground)]">{feature.description}</p>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

function FlowSection() {
  const steps = [
    "Connect workspace + X account",
    "Ingest timeline and extract style",
    "Generate and version drafts",
    "Schedule, publish, and monitor signals"
  ];

  return (
    <section className="rounded-3xl border border-[var(--border)] bg-[var(--background)]/70 p-6">
      <h2 className="font-display text-2xl text-[var(--foreground)] sm:text-3xl">
        Fast onboarding flow
      </h2>
      <ol className="mt-5 grid gap-3 text-sm text-[var(--foreground)] sm:grid-cols-2">
        {steps.map((step, index) => (
          <li
            key={step}
            className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3"
          >
            <span className="mr-2 text-xs font-semibold text-[var(--primary)]">0{index + 1}</span>
            {step}
          </li>
        ))}
      </ol>
    </section>
  );
}

export function LandingPage() {
  return (
    <main
      id="main-content"
      className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-8 sm:px-6 lg:px-8"
    >
      <div className="space-y-6">
        <LandingHero />
        <FeatureRail />
        <FlowSection />
        <WaitlistForm />
      </div>
    </main>
  );
}
