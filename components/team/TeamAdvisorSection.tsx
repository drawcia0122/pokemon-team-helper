"use client";

import { PokemonVisual } from "@/components/pokemon/PokemonVisual";
import { useEffect, useState, type ReactNode } from "react";
import type {
  AdvisorRecommendationCategory,
  AdvisorSwapPlan,
  AdvisorSwapSimulation
} from "@/lib/advisorSwapSimulator";
import { getAdvisorCategoryLabels } from "@/lib/advisorSwapSimulator";
import type {
  AdvisorDiagnosticCategory,
  AdvisorTeamDiagnostics
} from "@/lib/advisorTeamDiagnostics";
import type { TeamAdvisorAnalysis } from "@/lib/teamAdvisor";
import type { TeamProfile } from "@/lib/teamProfile";
import { getTypeLabel } from "@/lib/typeChart";
import type { TypeName } from "@/types/pokemon";
import styles from "./TeamWorkspace.module.css";

type TeamAdvisorSectionProps = {
  advisor: TeamAdvisorAnalysis;
  simulation: AdvisorSwapSimulation;
  teamDiagnostics: AdvisorTeamDiagnostics;
  canAnalyze: boolean;
  profile: TeamProfile;
};

export function TeamAdvisorSection({
  advisor,
  simulation,
  teamDiagnostics,
  canAnalyze,
  profile
}: TeamAdvisorSectionProps) {
  return (
    <section
      className={styles.advisorSection}
      aria-labelledby="team-advisor-heading"
    >
      <div className={styles.sectionHeading}>
        <div>
          <span className={styles.step}>STEP 4</span>
          <h2 id="team-advisor-heading">チームアドバイザー</h2>
          <p>
            現在の課題を確認し、追加・入れ替え後の変化を比べて改善案を検討できます。
          </p>
        </div>
      </div>

      <div className={styles.advisorSectionStack}>
        <AdvisorIssues advisor={advisor} canAnalyze={canAnalyze} />
        <AdvisorRecommendations
          simulation={simulation}
          canAnalyze={canAnalyze}
          profile={profile}
        />
        <AdvisorTeamDiagnosticsPanel
          diagnostics={teamDiagnostics}
          canAnalyze={canAnalyze}
        />
      </div>

      <p className={styles.advisorNote}>
        タイプ相性・種族値・Pokemon Showdown環境統計を使った参考シミュレーションです。実採用攻撃技と特性による相性変化を考慮し、持ち物とテラスタイプは考慮していません。
      </p>
    </section>
  );
}

function AdvisorBlockHeading({
  number,
  id,
  children
}: {
  number: number;
  id: string;
  children: ReactNode;
}) {
  return (
    <h3 className={styles.advisorBlockHeading} id={id}>
      <span>{number}</span>
      {children}
    </h3>
  );
}

function AdvisorIssues({
  advisor,
  canAnalyze
}: {
  advisor: TeamAdvisorAnalysis;
  canAnalyze: boolean;
}) {
  return (
    <section
      className={styles.advisorContentBlock}
      aria-labelledby="advisor-issues-heading"
    >
      <AdvisorBlockHeading number={1} id="advisor-issues-heading">
        現在の課題
      </AdvisorBlockHeading>
      {advisor.issues.length ? (
        <ul className={styles.advisorIssueList}>
          {advisor.issues.map((issue) => (
            <li key={issue.id}>
              <strong>{issue.title}</strong>
              <span>{issue.reason}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.advisorEmpty} role="status">
          {canAnalyze
            ? "大きな課題は見つかりませんでした。"
            : "2体以上入力すると課題を分析します。"}
        </p>
      )}
    </section>
  );
}

function AdvisorRecommendations({
  simulation,
  canAnalyze,
  profile
}: {
  simulation: AdvisorSwapSimulation;
  canAnalyze: boolean;
  profile: TeamProfile;
}) {
  const [category, setCategory] =
    useState<AdvisorRecommendationCategory>("overall");
  const [selectedType, setSelectedType] = useState<TypeName | "">(
    simulation.typeOptions[0]?.type ?? ""
  );

  useEffect(() => {
    if (
      !selectedType ||
      !simulation.typeOptions.some((option) => option.type === selectedType)
    ) {
      setSelectedType(simulation.typeOptions[0]?.type ?? "");
    }
  }, [selectedType, simulation.typeOptions]);

  const plans =
    category === "typeSpecific"
      ? selectedType
        ? simulation.typePlans[selectedType] ?? []
        : []
      : simulation.plansByCategory[category];
  const categoryLabels = getAdvisorCategoryLabels(profile);

  return (
    <section
      className={styles.advisorContentBlock}
      aria-labelledby="advisor-candidates-heading"
    >
      <AdvisorBlockHeading number={2} id="advisor-candidates-heading">
        改善候補と入れ替え案
      </AdvisorBlockHeading>
      {canAnalyze ? (
        <div className={styles.advisorCategoryControls}>
          <label>
            <span>推薦カテゴリ</span>
            <select
              value={category}
              onChange={(event) =>
                setCategory(
                  event.target.value as AdvisorRecommendationCategory
                )
              }
            >
              {(Object.keys(categoryLabels) as AdvisorRecommendationCategory[]).map(
                (value) => (
                  <option key={value} value={value}>
                    {categoryLabels[value]}
                  </option>
                )
              )}
            </select>
          </label>
          {category === "typeSpecific" && simulation.typeOptions.length ? (
            <label>
              <span>改善タイプ</span>
              <select
                value={selectedType}
                onChange={(event) =>
                  setSelectedType(event.target.value as TypeName)
                }
              >
                {simulation.typeOptions.map((option) => (
                  <option key={option.type} value={option.type}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      ) : null}
      {plans.length ? (
        <>
          <ol className={styles.advisorCandidateGrid}>
            {plans.map((plan) => (
              <li key={plan.candidate.pokemon.speciesId}>
                <AdvisorRecommendationCard
                  plan={plan}
                  category={category}
                  profile={profile}
                />
              </li>
            ))}
          </ol>
          <p className={styles.advisorSimulationMeta}>
            {simulation.evaluatedPatternCount}通りを比較し、要警戒TOP5を
            {simulation.recomputedThreatAnalysisCount}回再抽出しました。
          </p>
        </>
      ) : (
        <p className={styles.advisorEmpty} role="status">
          {canAnalyze
            ? "明確に改善する入れ替え案は見つかりませんでした。"
            : "2体以上入力すると追加・入れ替え案を比較します。"}
        </p>
      )}
    </section>
  );
}

function formatThreatDelta(plan: AdvisorSwapPlan): string {
  if (plan.threatAverageDelta === null) return "環境データ待ち";
  if (plan.threatAverageDelta === 0) return "±0";
  return plan.threatAverageDelta > 0
    ? `+${plan.threatAverageDelta}`
    : `${plan.threatAverageDelta}`;
}

function AdvisorRecommendationCard({
  plan,
  category,
  profile
}: {
  plan: AdvisorSwapPlan;
  category: AdvisorRecommendationCategory;
  profile: TeamProfile;
}) {
  const candidate = plan.candidate;
  const categoryLabel = getAdvisorCategoryLabels(profile)[category];
  return (
    <article className={styles.advisorCandidateCard}>
      <span className={styles.advisorCategoryBadge}>
        {categoryLabel}
      </span>
      <div className={styles.advisorCandidateHeading}>
        <PokemonVisual
          appearance="plain"
          name={candidate.pokemon.nameJa}
          slug={candidate.pokemon.slug}
          pokemonId={candidate.pokemon.id}
          size="large"
        />
        <div className={styles.advisorCandidateIdentity}>
          <span className={styles.advisorRatingLabel}>総合改善量</span>
          <span
            className={styles.advisorImprovementScore}
            aria-label={`総合改善量 ${plan.improvementScore}`}
          >
            +{plan.improvementScore}
          </span>
          <strong>{candidate.pokemon.nameJa}</strong>
          <small>
            {candidate.pokemon.types.map(getTypeLabel).join(" / ")}
          </small>
        </div>
      </div>

      <div className={styles.advisorSwapSummary}>
        <div>
          <span>推奨する変更</span>
          <strong>
            {plan.action.kind === "add"
              ? "空き枠へ追加"
              : `${plan.action.removedLabel}を抜いて採用`}
          </strong>
        </div>
        <div>
          <span>要警戒TOP5平均</span>
          {plan.beforeThreatAverage !== null &&
          plan.afterThreatAverage !== null ? (
            <strong>
              {plan.beforeThreatAverage} → {plan.afterThreatAverage}
              <small
                className={
                  plan.threatAverageDelta !== null &&
                  plan.threatAverageDelta <= 0
                    ? styles.advisorDeltaGood
                    : styles.advisorDeltaBad
                }
              >
                （{formatThreatDelta(plan)}）
              </small>
            </strong>
          ) : (
            <strong>環境データの読み込み待ち</strong>
          )}
        </div>
      </div>

      <div className={styles.advisorChangeGrid}>
        <AdvisorChangeList
          title="おすすめ理由"
          items={plan.categoryReasons[category]}
          tone="improve"
          empty="明確な改善点はありません。"
        />
        <AdvisorChangeList
          title="注意点"
          items={plan.cautions}
          tone="caution"
          empty="大きな注意点はありません。"
        />
      </div>
    </article>
  );
}

function AdvisorChangeList({
  title,
  items,
  tone,
  empty
}: {
  title: string;
  items: string[];
  tone: "improve" | "caution";
  empty: string;
}) {
  return (
    <div
      className={`${styles.advisorChangeList} ${
        tone === "improve"
          ? styles.advisorChangeImprove
          : styles.advisorChangeCaution
      }`}
    >
      <h4>{title}</h4>
      {items.length ? (
        <ul>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p>{empty}</p>
      )}
    </div>
  );
}

function AdvisorTeamDiagnosticsPanel({
  diagnostics,
  canAnalyze
}: {
  diagnostics: AdvisorTeamDiagnostics;
  canAnalyze: boolean;
}) {
  return (
    <section
      className={styles.advisorContentBlock}
      aria-labelledby="advisor-details-heading"
    >
      <AdvisorBlockHeading number={3} id="advisor-details-heading">
        チーム詳細診断
      </AdvisorBlockHeading>
      <p className={styles.advisorDetailsIntro}>
        現在のチームを防御・攻撃・素早さ・タイプ補完の4分野で確認します。
      </p>
      {!canAnalyze ? (
        <p className={styles.advisorEmpty} role="status">
          2体以上入力するとチーム全体の状態を表示します。
        </p>
      ) : (
        <div className={styles.advisorDiagnosticsGrid}>
          {diagnostics.categories.map((category) => (
            <AdvisorDiagnosticCard key={category.id} category={category} />
          ))}
        </div>
      )}
    </section>
  );
}

function AdvisorDiagnosticCard({
  category
}: {
  category: AdvisorDiagnosticCategory;
}) {
  return (
    <article className={styles.advisorDiagnosticCard}>
      <h4>{category.title}</h4>
      <p>{category.summary}</p>
      <dl>
        {category.items.map((item) => (
          <div
            key={item.id}
            className={
              item.tone === "attention"
                ? styles.advisorDiagnosticAttention
                : item.tone === "positive"
                  ? styles.advisorDiagnosticPositive
                  : undefined
            }
          >
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}
