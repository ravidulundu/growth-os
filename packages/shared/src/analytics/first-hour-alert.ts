export type FirstHourAlertLevel = "ok" | "watch" | "critical";

export type FirstHourAlertThresholds = {
  minImpressions: number;
  minEngagementRate: number;
  criticalImpressions: number;
  criticalEngagementRate: number;
};

export type FirstHourAlertSnapshot = {
  impressions: number;
  likes: number;
  replies: number;
  reposts: number;
  quotes: number;
};

export type FirstHourAlertEvaluation = {
  level: FirstHourAlertLevel;
  reasons: string[];
  engagement: number;
  engagementRate: number;
};

function envNumber(readEnv: (key: string) => string | undefined, key: string, fallback: number) {
  const raw = readEnv(key);
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function resolveFirstHourAlertThresholds(readEnv?: (key: string) => string | undefined) {
  const source = readEnv ?? ((key: string) => process.env[key]);
  return {
    minImpressions: envNumber(source, "FIRST_HOUR_ALERT_MIN_IMPRESSIONS", 250),
    minEngagementRate: envNumber(source, "FIRST_HOUR_ALERT_MIN_ENGAGEMENT_RATE", 0.03),
    criticalImpressions: envNumber(source, "FIRST_HOUR_ALERT_CRITICAL_IMPRESSIONS", 100),
    criticalEngagementRate: envNumber(source, "FIRST_HOUR_ALERT_CRITICAL_ENGAGEMENT_RATE", 0.015)
  } satisfies FirstHourAlertThresholds;
}

export function evaluateFirstHourAlert(
  snapshot: FirstHourAlertSnapshot,
  thresholds: FirstHourAlertThresholds
): FirstHourAlertEvaluation {
  const engagement = snapshot.likes + snapshot.replies + snapshot.reposts + snapshot.quotes;
  const engagementRate = snapshot.impressions > 0 ? engagement / snapshot.impressions : 0;
  const reasons: string[] = [];
  let level: FirstHourAlertLevel = "ok";

  if (snapshot.impressions < thresholds.criticalImpressions) {
    level = "critical";
    reasons.push("critical_impressions");
  } else if (snapshot.impressions < thresholds.minImpressions) {
    level = "watch";
    reasons.push("low_impressions");
  }

  if (engagementRate < thresholds.criticalEngagementRate) {
    level = "critical";
    reasons.push("critical_engagement_rate");
  } else if (engagementRate < thresholds.minEngagementRate) {
    if (level !== "critical") {
      level = "watch";
    }
    reasons.push("low_engagement_rate");
  }

  return {
    level,
    reasons,
    engagement,
    engagementRate: Number(engagementRate.toFixed(4))
  };
}
