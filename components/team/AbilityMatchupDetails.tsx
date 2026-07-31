"use client";

import { useState } from "react";
import type { AdvisorSwapPlan } from "@/lib/advisorSwapSimulator";
import { getPokemonBySlug } from "@/lib/typeChart";
import type { MatchupVerdict } from "@/types/matchupCore";
import styles from "./TeamWorkspace.module.css";

const VERDICT_LABELS: Record<MatchupVerdict, string> = {
  "hard-answer": "安定して対応しやすい",
  favorable: "一般的な構成には有利",
  "soft-check": "対面からなら対応可能",
  "emergency-check": "緊急時の対処手段がある",
  "utility-only": "妨害はできるが、安定した対策ではない",
  volatile: "型や状況によって結果が変わる",
  unfavorable: "一般的な構成には不利",
  "hard-lost": "主要な行動が通りにくい",
  unknown: "データ不足で判断できない"
};

export function AbilityMatchupDetails({ plan }: { plan: AdvisorSwapPlan }) {
  const [isOpen, setIsOpen] = useState(false);
  const ability = plan.abilityDenialProfile;
  if (!ability || ability.entries.length === 0) return null;
  const matchups = plan.threatCoverage.threatAnswers
    .flatMap((answer) => (answer.matchup ? [answer.matchup] : []))
    .slice(0, 3);
  return (
    <details
      className={styles.advisorDiagnosticDetails}
      open={isOpen}
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
    >
      <summary
        aria-expanded={isOpen}
        aria-label="特性と主要対面の詳細"
      >
        特性と主要対面の詳細
      </summary>
      {plan.abilityExplanation.length ? (
        <ul>
          {plan.abilityExplanation.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      ) : null}
      {plan.defensiveCoreProfile ? (
        <p>
          守りの組み合わせ: {plan.defensiveCoreProfile.coreSynergy.toFixed(0)}
          / 100。{plan.defensiveCoreProfile.explanations[0]}
        </p>
      ) : null}
      {matchups.length ? (
        <dl>
          {matchups.map((matchup) => (
            <div key={matchup.threat}>
              <dt>
                {getPokemonBySlug(matchup.threat)?.nameJa ?? matchup.threat}
              </dt>
              <dd>{VERDICT_LABELS[matchup.verdict]}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </details>
  );
}
