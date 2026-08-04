import { AdvisorNextCandidateCard } from "@/components/team/AdvisorNextCandidateCard";
import type {
  ProgressiveAdvisorCandidate,
  ProgressiveAdvisorMode
} from "@/lib/advisorPhaseScoring";
import type { AdvisorSwapPlan } from "@/lib/advisorSwapSimulator";
import type { PokemonEntry, TeamSlot } from "@/types/pokemon";
import type { GoalOrientedCandidatePlan } from "@/types/goalOrientedTeamBuilder";
import styles from "./TeamWorkspace.module.css";

export function AdvisorNextCandidateList({
  candidates,
  mode,
  memberCount,
  team,
  availablePokemon,
  goalBuilderPlans,
  goalBuilderErrors,
  onApply
}: {
  candidates: ProgressiveAdvisorCandidate[];
  mode: ProgressiveAdvisorMode;
  memberCount: number;
  team: TeamSlot[];
  availablePokemon: PokemonEntry[];
  goalBuilderPlans: ReadonlyMap<string, GoalOrientedCandidatePlan>;
  goalBuilderErrors: ReadonlySet<string>;
  onApply: (plan: AdvisorSwapPlan) => void;
}) {
  return (
    <ol className={styles.advisorCandidateGrid}>
      {candidates.map((candidate) => (
        <li key={candidate.plan.candidate.pokemon.speciesId}>
          <AdvisorNextCandidateCard
            candidate={candidate}
            mode={mode}
            memberCount={memberCount}
            team={team}
            availablePokemon={availablePokemon}
            goalBuilderPlan={goalBuilderPlans.get(
              candidate.plan.candidate.pokemon.slug
            )}
            goalBuilderError={goalBuilderErrors.has(
              candidate.plan.candidate.pokemon.slug
            )}
            onApply={onApply}
          />
        </li>
      ))}
    </ol>
  );
}
