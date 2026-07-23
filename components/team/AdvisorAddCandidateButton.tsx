"use client";

import type {
  AdvisorCandidateAddability
} from "@/lib/advisorCandidateAddition";
import type { PokemonEntry } from "@/types/pokemon";
import styles from "./TeamWorkspace.module.css";

export function AdvisorAddCandidateButton({
  candidate,
  addability,
  onAdd
}: {
  candidate: PokemonEntry;
  addability: AdvisorCandidateAddability;
  onAdd: (candidate: PokemonEntry) => void;
}) {
  const reasonId = `advisor-add-reason-${candidate.slug.replaceAll(/[^a-z0-9-]/g, "-")}`;
  return (
    <div className={styles.advisorAddAction}>
      <button
        type="button"
        className={styles.addCandidate}
        onClick={() => onAdd(candidate)}
        disabled={!addability.allowed}
        aria-describedby={!addability.allowed ? reasonId : undefined}
      >
        このポケモンを空き枠へ追加
      </button>
      {!addability.allowed && addability.reason ? (
        <small id={reasonId} className={styles.advisorDisabledReason}>
          {addability.reason}
        </small>
      ) : null}
    </div>
  );
}
