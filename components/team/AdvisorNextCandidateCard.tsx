import { PokemonVisual } from "@/components/pokemon/PokemonVisual";
import { AdvisorAddCandidateButton } from "@/components/team/AdvisorAddCandidateButton";
import {
  getAdvisorCandidateAddability
} from "@/lib/advisorCandidateAddition";
import {
  PROGRESSIVE_ADVISOR_MODE_LABELS,
  type ProgressiveAdvisorCandidate,
  type ProgressiveAdvisorMode
} from "@/lib/advisorPhaseScoring";
import {
  getAdvisorCounterplayMethodLabel
} from "@/lib/advisorThreatCoverage";
import {
  getAdvisorMegaCandidateNote,
  getAdvisorMegaTeamState
} from "@/lib/advisorMegaRecommendation";
import { getTypeLabel } from "@/lib/typeChart";
import type { PokemonEntry, TeamSlot } from "@/types/pokemon";
import styles from "./TeamWorkspace.module.css";

function countLabel(value: number): string {
  return `${value}種類`;
}

function confidenceLabel(confidence: "high" | "medium" | "low"): string {
  if (confidence === "high") return "確度高";
  if (confidence === "medium") return "確度中";
  return "確度低";
}

export function AdvisorNextCandidateCard({
  candidate,
  mode,
  memberCount,
  team,
  availablePokemon,
  onAdd
}: {
  candidate: ProgressiveAdvisorCandidate;
  mode: ProgressiveAdvisorMode;
  memberCount: number;
  team: TeamSlot[];
  availablePokemon: PokemonEntry[];
  onAdd: (pokemon: PokemonEntry) => void;
}) {
  const plan = candidate.plan;
  const pokemon = plan.candidate.pokemon;
  const addability = getAdvisorCandidateAddability({
    team,
    candidate: pokemon,
    availablePokemon
  });
  const megaState = getAdvisorMegaTeamState(team);
  const megaNote = getAdvisorMegaCandidateNote({
    currentTeamSize: megaState.currentTeamSize,
    currentMegaCount: megaState.currentMegaCount,
    candidateIsMega: pokemon.formKind === "mega",
    actionKind: "add"
  });
  const counterplayMethods = [
    ...new Set(
      plan.threatCoverage.threatAnswers
        .filter((answer) => answer.answerStrength >= 0.6)
        .flatMap((answer) => answer.counterplayMethods)
        .filter((method) => method !== "conditional" && method !== "none")
    )
  ].slice(0, 3);
  const partner = candidate.partnerSynergy;
  const explanation = candidate.explanationsByMode[mode];
  const reasons = explanation.primaryReasons;

  return (
    <article className={styles.advisorCandidateCard}>
      <div className={styles.advisorCandidateBadges}>
        <span className={styles.advisorCategoryBadge}>
          {memberCount === 1
            ? "相棒候補"
            : `${Math.min(6, memberCount + 1)}匹目候補`}
          {" · "}
          {PROGRESSIVE_ADVISOR_MODE_LABELS[mode]}
        </span>
        {megaNote ? (
          <span className={styles.advisorMegaCandidateBadge}>
            {megaNote}
          </span>
        ) : null}
        {explanation.label ? (
          <span className={styles.advisorCategoryBadge}>
            {explanation.label}
          </span>
        ) : null}
      </div>
      <div className={styles.advisorCandidateHeading}>
        <PokemonVisual
          appearance="plain"
          name={pokemon.nameJa}
          slug={pokemon.slug}
          pokemonId={pokemon.id}
          size="large"
        />
        <div className={styles.advisorCandidateIdentity}>
          <span className={styles.advisorRatingLabel}>段階内の適合度</span>
          <span
            className={styles.advisorImprovementScore}
            aria-label={`段階内の適合度 ${candidate.modeScores[mode]}`}
          >
            {candidate.modeScores[mode]}
          </span>
          <strong>{pokemon.nameJa}</strong>
          <small>{pokemon.types.map(getTypeLabel).join(" / ")}</small>
        </div>
      </div>

      <div className={styles.advisorSwapSummary}>
        {partner ? (
          <>
            <div>
              <span>軸の弱点をカバー</span>
              <strong>
                {partner.coveredAnchorWeaknesses.length} /{" "}
                {partner.anchorWeaknesses.length}種類
              </strong>
            </div>
            <div>
              <span>候補の弱点を軸がカバー</span>
              <strong>
                {partner.coveredCandidateWeaknesses.length} /{" "}
                {partner.candidateWeaknesses.length}種類
              </strong>
            </div>
            <div>
              <span>共通弱点</span>
              <strong>{countLabel(partner.sharedWeaknesses.length)}</strong>
              <small>
                {partner.sharedWeaknesses.length
                  ? partner.sharedWeaknesses.map(getTypeLabel).join("・")
                  : "なし"}
                {partner.sharedQuadWeaknesses.length
                  ? `（共通4倍: ${partner.sharedQuadWeaknesses
                      .map(getTypeLabel)
                      .join("・")}）`
                  : ""}
              </small>
            </div>
            <div>
              <span>役割補完</span>
              <strong>
                {partner.roleAdditions.length
                  ? partner.roleAdditions
                      .map(
                        (role) =>
                          `${role.label}（${confidenceLabel(role.confidence)}）`
                      )
                      .slice(0, 2)
                      .join("・")
                  : "既存役割を補強"}
              </strong>
            </div>
            <div>
              <span>環境使用率</span>
              <strong>
                {plan.threatCoverage.candidateUsage === null
                  ? "データなし"
                  : `${(plan.threatCoverage.candidateUsage * 100).toFixed(1)}%`}
              </strong>
            </div>
          </>
        ) : (
          <>
            <div>
              <span>現在の課題</span>
              <strong>
                {plan.beforeIssues.length}件 → {plan.afterIssues.length}件
              </strong>
            </div>
            <div>
              <span>要警戒TOP5平均</span>
              <strong>
                {plan.beforeThreatAverage !== null &&
                plan.afterThreatAverage !== null
                  ? `${plan.beforeThreatAverage} → ${plan.afterThreatAverage}`
                  : "環境データ待ち"}
              </strong>
            </div>
            <div>
              <span>要警戒相手への回答</span>
              <strong>
                {plan.threatCoverage.distinctThreatCount} /{" "}
                {plan.threatCoverage.threatAnswers.length}体
              </strong>
              <small>
                {counterplayMethods.length
                  ? counterplayMethods
                      .map(getAdvisorCounterplayMethodLabel)
                      .join("・")
                  : "明確な回答を評価中"}
              </small>
            </div>
            <div>
              <span>環境使用率</span>
              <strong>
                {plan.threatCoverage.candidateUsage === null
                  ? "データなし"
                  : `${(plan.threatCoverage.candidateUsage * 100).toFixed(1)}%`}
              </strong>
            </div>
          </>
        )}
      </div>

      <div className={styles.advisorChangeGrid}>
        <div
          className={`${styles.advisorChangeList} ${styles.advisorChangeImprove}`}
        >
          <h4>おすすめ理由</h4>
          {reasons.length ? (
            <ul>
              {reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : (
            <p>明確な改善理由を評価中です。</p>
          )}
        </div>
        <div
          className={`${styles.advisorChangeList} ${styles.advisorChangeOther}`}
        >
          <h4>その他の改善</h4>
          {explanation.otherImprovements.length ? (
            <ul>
              {explanation.otherImprovements.map((improvement) => (
                <li key={improvement}>{improvement}</li>
              ))}
            </ul>
          ) : (
            <p>追加の改善点はありません。</p>
          )}
        </div>
        <div
          className={`${styles.advisorChangeList} ${styles.advisorChangeCaution}`}
        >
          <h4>注意点</h4>
          {explanation.cautions.length ? (
            <ul>
              {explanation.cautions.map((caution) => (
                <li key={caution}>{caution}</li>
              ))}
            </ul>
          ) : (
            <p>大きな注意点は見つかりませんでした。</p>
          )}
        </div>
      </div>

      <AdvisorAddCandidateButton
        candidate={pokemon}
        addability={addability}
        onAdd={onAdd}
      />
    </article>
  );
}
