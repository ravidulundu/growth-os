import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction
} from "react";
import {
  fetchAuthSessionState,
  patchAuthSessionState,
  type OnboardingState,
  type OnboardingSteps
} from "../../../lib/api";
import type { StudioView } from "../types";

type OnboardingStepKey = keyof OnboardingSteps;

type UseStudioOnboardingParams = {
  userId: string;
  workspaceId: string;
  selectedAccountId: string;
  contentId: string;
  hasTimelineIngested: boolean;
  hasStyleExtracted: boolean;
  setActiveView: (view: StudioView) => void;
  setWorkspaceId: (workspaceId: string) => void;
  setSelectedAccountId: (accountId: string) => void;
  setContentId: (contentId: string) => void;
  setTopic: (topic: string) => void;
  setDraftText: (value: string) => void;
  setSavedText: (value: string) => void;
};

type SetOnboarding = Dispatch<SetStateAction<OnboardingState>>;
type SetServerLoaded = Dispatch<SetStateAction<boolean>>;

const ONBOARDING_STORAGE_KEY = "growth_os_onboarding_state_v1";

const DEMO_FIXTURE = {
  workspaceId: "11111111-1111-4111-8111-111111111111",
  accountId: "22222222-2222-4222-8222-222222222222",
  contentId: "33333333-3333-4333-8333-333333333333",
  topic: "Demo launch plan: 7-day creator sprint",
  draftText:
    "Day 1: Define one measurable growth loop.\nDay 2: Ship one post format.\nDay 3: Measure first-hour signal.\nRepeat with evidence, not opinions."
};

function defaultOnboardingSteps(): OnboardingSteps {
  return {
    workspaceValidated: false,
    xConnected: false,
    timelineIngested: false,
    styleExtracted: false,
    draftGenerated: false
  };
}

function defaultOnboardingState(): OnboardingState {
  return {
    workspaceId: null,
    steps: defaultOnboardingSteps(),
    completedAt: null,
    updatedAt: null
  };
}

function readLocalOnboardingState() {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as OnboardingState;
    if (!parsed || typeof parsed !== "object" || !parsed.steps) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function mergeSteps(base: OnboardingSteps, patch: Partial<OnboardingSteps>): OnboardingSteps {
  return {
    workspaceValidated: patch.workspaceValidated ?? base.workspaceValidated,
    xConnected: patch.xConnected ?? base.xConnected,
    timelineIngested: patch.timelineIngested ?? base.timelineIngested,
    styleExtracted: patch.styleExtracted ?? base.styleExtracted,
    draftGenerated: patch.draftGenerated ?? base.draftGenerated
  };
}

function mergeState(base: OnboardingState, patch: OnboardingState | null): OnboardingState {
  if (!patch) {
    return base;
  }

  return {
    workspaceId: patch.workspaceId ?? base.workspaceId,
    steps: mergeSteps(base.steps, patch.steps),
    completedAt: patch.completedAt ?? base.completedAt,
    updatedAt: patch.updatedAt ?? base.updatedAt
  };
}

function isOnboardingComplete(steps: OnboardingSteps) {
  return Object.values(steps).every((value) => value);
}

function deriveStepOverrides(params: UseStudioOnboardingParams): Partial<OnboardingSteps> {
  return {
    workspaceValidated: Boolean(params.workspaceId),
    xConnected: Boolean(params.selectedAccountId),
    timelineIngested: params.hasTimelineIngested,
    styleExtracted: params.hasStyleExtracted,
    draftGenerated: Boolean(params.contentId)
  };
}

function nextOnboardingStep(steps: OnboardingSteps): OnboardingStepKey | null {
  if (!steps.workspaceValidated) {
    return "workspaceValidated";
  }
  if (!steps.xConnected) {
    return "xConnected";
  }
  if (!steps.timelineIngested) {
    return "timelineIngested";
  }
  if (!steps.styleExtracted) {
    return "styleExtracted";
  }
  if (!steps.draftGenerated) {
    return "draftGenerated";
  }
  return null;
}

function completedStepCount(steps: OnboardingSteps) {
  return Object.values(steps).filter(Boolean).length;
}

function useOnboardingLocalBootstrap(setOnboarding: SetOnboarding) {
  useEffect(() => {
    setOnboarding((previous) => mergeState(previous, readLocalOnboardingState()));
  }, [setOnboarding]);
}

function useOnboardingServerBootstrap(
  userId: string,
  setOnboarding: SetOnboarding,
  setServerLoaded: SetServerLoaded
) {
  useEffect(() => {
    if (!userId) {
      setServerLoaded(false);
      return;
    }

    let cancelled = false;
    void fetchAuthSessionState()
      .then((result) => {
        if (!cancelled) {
          setOnboarding((previous) => mergeState(previous, result.onboarding));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setServerLoaded(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [userId, setOnboarding, setServerLoaded]);
}

function useOnboardingDerivedState(
  params: UseStudioOnboardingParams,
  setOnboarding: SetOnboarding
) {
  useEffect(() => {
    const stepOverrides = deriveStepOverrides(params);
    setOnboarding((previous) => {
      const mergedSteps = mergeSteps(previous.steps, stepOverrides);
      const completedAt =
        isOnboardingComplete(mergedSteps) && !previous.completedAt
          ? new Date().toISOString()
          : previous.completedAt;
      return {
        ...previous,
        workspaceId: params.workspaceId || previous.workspaceId,
        steps: mergedSteps,
        completedAt
      };
    });
  }, [
    params.workspaceId,
    params.selectedAccountId,
    params.contentId,
    params.hasTimelineIngested,
    params.hasStyleExtracted,
    setOnboarding
  ]);
}

function useOnboardingLocalPersistence(onboarding: OnboardingState) {
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(onboarding));
  }, [onboarding]);
}

function useOnboardingRemoteSync(
  userId: string,
  serverLoaded: boolean,
  onboarding: OnboardingState,
  lastSyncedRef: MutableRefObject<string>
) {
  useEffect(() => {
    if (!userId || !serverLoaded) {
      return;
    }

    const serialized = JSON.stringify(onboarding);
    if (serialized === lastSyncedRef.current) {
      return;
    }

    lastSyncedRef.current = serialized;
    void patchAuthSessionState({
      workspaceId: onboarding.workspaceId ?? undefined,
      steps: onboarding.steps,
      completedAt: onboarding.completedAt
    }).catch(() => {
      // Best effort sync; local state remains the source of truth during network failures.
    });
  }, [userId, onboarding, serverLoaded, lastSyncedRef]);
}

function markOnboardingComplete(setOnboarding: SetOnboarding) {
  setOnboarding((previous) => ({
    workspaceId: DEMO_FIXTURE.workspaceId,
    steps: {
      workspaceValidated: true,
      xConnected: true,
      timelineIngested: true,
      styleExtracted: true,
      draftGenerated: true
    },
    completedAt: previous.completedAt ?? new Date().toISOString(),
    updatedAt: previous.updatedAt
  }));
}

export function useStudioOnboarding(params: UseStudioOnboardingParams) {
  const [onboarding, setOnboarding] = useState<OnboardingState>(defaultOnboardingState());
  const [serverLoaded, setServerLoaded] = useState(false);
  const lastSyncedRef = useRef("");

  useOnboardingLocalBootstrap(setOnboarding);
  useOnboardingServerBootstrap(params.userId, setOnboarding, setServerLoaded);
  useOnboardingDerivedState(params, setOnboarding);
  useOnboardingLocalPersistence(onboarding);
  useOnboardingRemoteSync(params.userId, serverLoaded, onboarding, lastSyncedRef);

  const onboardingNextStep = useMemo(
    () => nextOnboardingStep(onboarding.steps),
    [onboarding.steps]
  );
  const onboardingProgressPercent = useMemo(
    () => Math.round((completedStepCount(onboarding.steps) / 5) * 100),
    [onboarding.steps]
  );

  const handleUseDemoWorkspace = () => {
    params.setWorkspaceId(DEMO_FIXTURE.workspaceId);
    params.setSelectedAccountId(DEMO_FIXTURE.accountId);
    params.setContentId(DEMO_FIXTURE.contentId);
    params.setTopic(DEMO_FIXTURE.topic);
    params.setDraftText(DEMO_FIXTURE.draftText);
    params.setSavedText(DEMO_FIXTURE.draftText);
    params.setActiveView("generator");
    markOnboardingComplete(setOnboarding);
  };

  return {
    onboardingState: onboarding,
    onboardingProgressPercent,
    onboardingNextStep,
    onboardingCompleted: isOnboardingComplete(onboarding.steps),
    handleUseDemoWorkspace
  };
}
