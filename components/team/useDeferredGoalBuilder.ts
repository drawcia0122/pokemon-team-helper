"use client";

import {
  startTransition,
  useEffect,
  useMemo,
  useState
} from "react";
import type { AdvisorBuildPhase } from "@/lib/advisorBuildPhase";
import type { ProgressiveAdvisorCandidate } from "@/lib/advisorPhaseScoring";
import type { AdvisorSwapSimulation } from "@/lib/advisorSwapSimulator";
import {
  calculateDeferredGoalBuilderPlan,
  getDeferredGoalBuilderScopeKey,
  readDeferredGoalBuilderPlan
} from "@/lib/recommendationIntegrationRuntime";
import type { GoalOrientedCandidatePlan } from "@/types/goalOrientedTeamBuilder";

type DeferredGoalBuilderState = {
  requestKey: string;
  plans: ReadonlyMap<string, GoalOrientedCandidatePlan>;
  errors: ReadonlySet<string>;
};

export function useDeferredGoalBuilder({
  active,
  simulation,
  phase,
  candidates
}: {
  active: boolean;
  simulation: AdvisorSwapSimulation;
  phase: AdvisorBuildPhase;
  candidates: ProgressiveAdvisorCandidate[];
}): {
  plans: ReadonlyMap<string, GoalOrientedCandidatePlan>;
  errors: ReadonlySet<string>;
} {
  const candidateSignature = candidates
    .map((candidate) => candidate.plan.candidate.pokemon.slug)
    .join(",");
  const requestKey = useMemo(
    () =>
      `${getDeferredGoalBuilderScopeKey(simulation) ?? "unavailable"}:${phase}:${candidateSignature}`,
    [candidateSignature, phase, simulation]
  );
  const [state, setState] = useState<DeferredGoalBuilderState>({
    requestKey: "",
    plans: new Map(),
    errors: new Set()
  });

  useEffect(() => {
    if (!active || candidates.length === 0) return;
    let cancelled = false;
    const cachedPlans = new Map<string, GoalOrientedCandidatePlan>();
    const pending: string[] = [];
    for (const candidate of candidates) {
      const candidateSlug = candidate.plan.candidate.pokemon.slug;
      const cached = readDeferredGoalBuilderPlan({
        simulation,
        candidateSlug,
        phase
      });
      if (cached) cachedPlans.set(candidateSlug, cached);
      else pending.push(candidateSlug);
    }
    setState({
      requestKey,
      plans: cachedPlans,
      errors: new Set()
    });

    let timer: ReturnType<typeof setTimeout> | null = null;
    const calculateNext = () => {
      const candidateSlug = pending.shift();
      if (!candidateSlug || cancelled) return;
      timer = setTimeout(() => {
        if (cancelled) return;
        try {
          const result = calculateDeferredGoalBuilderPlan({
            simulation,
            candidateSlug,
            phase
          });
          startTransition(() => {
            setState((current) => {
              if (current.requestKey !== requestKey) return current;
              if (!result.plan) {
                const errors = new Set(current.errors);
                errors.add(candidateSlug);
                return { ...current, errors };
              }
              const plans = new Map(current.plans);
              plans.set(candidateSlug, result.plan);
              return { ...current, plans };
            });
          });
        } catch {
          setState((current) => {
            if (current.requestKey !== requestKey) return current;
            const errors = new Set(current.errors);
            errors.add(candidateSlug);
            return { ...current, errors };
          });
        }
        calculateNext();
      }, 0);
    };
    calculateNext();
    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
    };
  }, [active, candidates, phase, requestKey, simulation]);

  if (!active || state.requestKey !== requestKey) {
    return { plans: new Map(), errors: new Set() };
  }
  return { plans: state.plans, errors: state.errors };
}
