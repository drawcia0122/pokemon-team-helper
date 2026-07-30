"use client";

import {
  getAdvisorCandidateActionability
} from "@/lib/advisorCandidateActions";
import type { AdvisorSwapPlan } from "@/lib/advisorSwapSimulator";
import type { PokemonEntry, TeamSlot } from "@/types/pokemon";
import styles from "./TeamWorkspace.module.css";

export function AdvisorCandidateActionButton({
  plan,
  team,
  availablePokemon,
  onApply
}: {
  plan: AdvisorSwapPlan;
  team: TeamSlot[];
  availablePokemon: PokemonEntry[];
  onApply: (plan: AdvisorSwapPlan) => void;
}) {
  const actionability = getAdvisorCandidateActionability({
    team,
    sourceTeam: plan.beforeTeam,
    candidate: plan.candidate.pokemon,
    action: plan.action,
    availablePokemon
  });
  const reasonId = `advisor-action-reason-${plan.candidate.pokemon.slug.replaceAll(/[^a-z0-9-]/g, "-")}-${plan.action.removedSlotId ?? "add"}`;
  const label =
    plan.action.kind === "add" ? "空き枠に追加" : "この変更を適用";
  const actionLabel =
    plan.action.kind === "add"
      ? `${plan.candidate.pokemon.nameJa}を空き枠に追加`
      : `${plan.candidate.pokemon.nameJa}への変更を適用`;

  return (
    <div className={styles.advisorAddAction}>
      <button
        type="button"
        className={styles.addCandidate}
        onClick={() => onApply(plan)}
        disabled={!actionability.allowed}
        aria-label={actionLabel}
        aria-describedby={!actionability.allowed ? reasonId : undefined}
      >
        {label}
      </button>
      {!actionability.allowed && actionability.reason ? (
        <small id={reasonId} className={styles.advisorDisabledReason}>
          {actionability.reason}
        </small>
      ) : null}
    </div>
  );
}
