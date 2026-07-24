"use client";

import { PokemonVisual } from "@/components/pokemon/PokemonVisual";
import { AdvisorNextCandidateList } from "@/components/team/AdvisorNextCandidateList";
import { AdvisorPhaseHeader } from "@/components/team/AdvisorPhaseHeader";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode
} from "react";
import type {
  AdvisorRecommendationCategory,
  AdvisorSwapPlan,
  AdvisorSwapSimulation,
  AdvisorThreatExploreMode
} from "@/lib/advisorSwapSimulator";
import { getAdvisorCategoryLabels } from "@/lib/advisorSwapSimulator";
import { getAdvisorBuildPhase } from "@/lib/advisorBuildPhase";
import { buildAdvisorExplanationPresentation } from "@/lib/advisorExplanation";
import {
  getAdvisorAnswerClassLabel,
  getAdvisorCounterplayMethodLabel
} from "@/lib/advisorThreatCoverage";
import {
  getAdvisorMegaCandidateNote,
  getAdvisorMegaTeamState
} from "@/lib/advisorMegaRecommendation";
import type {
  AdvisorDiagnosticCategory,
  AdvisorTeamDiagnostics
} from "@/lib/advisorTeamDiagnostics";
import type { TeamAdvisorAnalysis } from "@/lib/teamAdvisor";
import {
  PROGRESSIVE_ADVISOR_MODE_LABELS,
  type ProgressiveAdvisorMode
} from "@/lib/advisorPhaseScoring";
import {
  getProgressiveAdvisorModePlans,
  type ProgressiveTeamAdvisorAnalysis
} from "@/lib/progressiveTeamAdvisor";
import type { TeamProfile } from "@/lib/teamProfile";
import { getPokemonBySlug, getTypeLabel } from "@/lib/typeChart";
import type { PokemonEntry, TeamSlot, TypeName } from "@/types/pokemon";
import styles from "./TeamWorkspace.module.css";

type TeamAdvisorSectionProps = {
  advisor: TeamAdvisorAnalysis;
  simulation: AdvisorSwapSimulation;
  teamDiagnostics: AdvisorTeamDiagnostics;
  canAnalyze: boolean;
  profile: TeamProfile;
  progressive: ProgressiveTeamAdvisorAnalysis;
  team: TeamSlot[];
  availablePokemon: PokemonEntry[];
  onAddCandidate: (pokemon: PokemonEntry) => void;
  onUndoCandidate: () => void;
  canUndoCandidate: boolean;
  actionNotice: string;
};

export function TeamAdvisorSection({
  advisor,
  simulation,
  teamDiagnostics,
  canAnalyze,
  profile,
  progressive,
  team,
  availablePokemon,
  onAddCandidate,
  onUndoCandidate,
  canUndoCandidate,
  actionNotice
}: TeamAdvisorSectionProps) {
  const isComplete = progressive.phase === "completeOptimization";
  const hasProgressiveExploration =
    !isComplete &&
    canAnalyze &&
    (simulation.formChangePlans.length > 0 ||
      simulation.threatRecommendations.length > 0);
  const diagnosticsHeadingNumber = hasProgressiveExploration ? 4 : 3;
  const phaseHeadingRef = useRef<HTMLHeadingElement>(null);
  const lastFocusedNotice = useRef("");
  useEffect(() => {
    if (!actionNotice || actionNotice === lastFocusedNotice.current) return;
    lastFocusedNotice.current = actionNotice;
    phaseHeadingRef.current?.focus({ preventScroll: true });
  }, [actionNotice]);
  return (
    <section
      className={styles.advisorSection}
      aria-labelledby="team-advisor-heading"
    >
      <div className={styles.sectionHeading}>
        <div>
          <span className={styles.step}>STEP 4 · チームアドバイザー</span>
          <h2
            id="team-advisor-heading"
            ref={phaseHeadingRef}
            tabIndex={-1}
          >
            チーム改善のおすすめ
          </h2>
          <p>
            現在の課題を確認し、おすすめ候補と改善内容を順に見ていきます。
          </p>
        </div>
      </div>

      <div
        className={styles.advisorLiveRegion}
        aria-live="polite"
        aria-atomic="true"
      >
        {actionNotice}
      </div>
      {canUndoCandidate ? (
        <div className={styles.advisorUndoNotice}>
          <span>直前の空き枠追加を元に戻せます。</span>
          <button type="button" onClick={onUndoCandidate}>
            追加を元に戻す
          </button>
        </div>
      ) : null}

      <div className={styles.advisorSectionStack}>
        {progressive.phase === "empty" ? (
          <AdvisorEmptyStart />
        ) : (
          <>
            {canAnalyze ? (
              <AdvisorIssues
                advisor={advisor}
                canAnalyze={canAnalyze}
                headingNumber={1}
              />
            ) : (
              <AdvisorPriorities analysis={progressive} />
            )}
            {!isComplete ? (
              <ProgressiveAdvisorRecommendations
                analysis={progressive}
                team={team}
                availablePokemon={availablePokemon}
                onAddCandidate={onAddCandidate}
              />
            ) : (
              <AdvisorRecommendations
                simulation={simulation}
                canAnalyze={canAnalyze}
                profile={profile}
                headingNumber={2}
                headingTitle="おすすめの入れ替え候補"
              />
            )}
            {hasProgressiveExploration ? (
              <AdvisorProgressiveExploration
                simulation={simulation}
                profile={profile}
              />
            ) : null}
            {canAnalyze ? (
              <AdvisorTeamDiagnosticsPanel
                diagnostics={teamDiagnostics}
                canAnalyze={canAnalyze}
                headingNumber={diagnosticsHeadingNumber}
              />
            ) : null}
          </>
        )}
        <AdvisorPhaseHeader analysis={progressive} />
      </div>

      <p className={styles.advisorNote}>
        タイプ相性・種族値・Pokemon Showdown環境統計を使った参考シミュレーションです。実採用攻撃技と特性による相性変化に加え、こだわりスカーフの採用率を考慮し、その他の持ち物とテラスタイプは考慮していません。
      </p>
    </section>
  );
}

function AdvisorPriorities({
  analysis
}: {
  analysis: ProgressiveTeamAdvisorAnalysis;
}) {
  return (
    <section
      className={styles.advisorContentBlock}
      aria-labelledby="advisor-priorities-heading"
    >
      <AdvisorBlockHeading number={1} id="advisor-priorities-heading">
        今のチームで優先すること
      </AdvisorBlockHeading>
      <ol className={styles.advisorPriorityList}>
        {analysis.priorities.map((priority) => (
          <li key={priority}>{priority}</li>
        ))}
      </ol>
    </section>
  );
}

function AdvisorEmptyStart() {
  return (
    <section
      className={styles.advisorContentBlock}
      aria-labelledby="advisor-empty-start-heading"
    >
      <AdvisorBlockHeading number={1} id="advisor-empty-start-heading">
        最初の1匹を選択
      </AdvisorBlockHeading>
      <p className={styles.advisorEmpty}>
        まず使いたいポケモンを1匹選んでください。
        1匹目を選ぶと、そのポケモンと相性の良い相棒候補を表示します。
      </p>
      <a className={styles.advisorInputLink} href="#team-input-heading">
        ポケモン選択へ
      </a>
    </section>
  );
}

function ProgressiveAdvisorRecommendations({
  analysis,
  team,
  availablePokemon,
  onAddCandidate
}: {
  analysis: ProgressiveTeamAdvisorAnalysis;
  team: TeamSlot[];
  availablePokemon: PokemonEntry[];
  onAddCandidate: (pokemon: PokemonEntry) => void;
}) {
  const [mode, setMode] = useState<ProgressiveAdvisorMode>("overall");
  const [selectedType, setSelectedType] = useState<TypeName | "">(
    analysis.typeOptions[0]?.type ?? ""
  );
  useEffect(() => {
    if (
      !selectedType ||
      !analysis.typeOptions.some((option) => option.type === selectedType)
    ) {
      setSelectedType(analysis.typeOptions[0]?.type ?? "");
    }
  }, [analysis.typeOptions, selectedType]);
  const candidates = getProgressiveAdvisorModePlans(
    analysis,
    mode,
    selectedType
  );
  return (
    <section
      className={styles.advisorContentBlock}
      aria-labelledby="advisor-next-candidates-heading"
    >
      <AdvisorBlockHeading number={2} id="advisor-next-candidates-heading">
        {analysis.presentation.candidateLabel}
      </AdvisorBlockHeading>
      <p className={styles.advisorDetailsIntro}>
        現在のチームに加えたとき、相性の良い候補から順に表示しています。
      </p>
      <div className={styles.advisorCategoryControls}>
        <label>
          <span>候補の見方</span>
          <select
            value={mode}
            onChange={(event) =>
              setMode(event.target.value as ProgressiveAdvisorMode)
            }
          >
            {(
              Object.keys(
                PROGRESSIVE_ADVISOR_MODE_LABELS
              ) as ProgressiveAdvisorMode[]
            ).map((value) => (
              <option key={value} value={value}>
                {PROGRESSIVE_ADVISOR_MODE_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        {mode === "typeSpecific" && analysis.typeOptions.length ? (
          <label>
            <span>候補のタイプ</span>
            <select
              value={selectedType}
              onChange={(event) =>
                setSelectedType(event.target.value as TypeName)
              }
            >
              {analysis.typeOptions.map((option) => (
                <option key={option.type} value={option.type}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      {candidates.length ? (
        <AdvisorNextCandidateList
          candidates={candidates}
          mode={mode}
          memberCount={analysis.memberCount}
          team={team}
          availablePokemon={availablePokemon}
          onAdd={onAddCandidate}
        />
      ) : (
        <p className={styles.advisorEmpty} role="status">
          この条件で、未解決課題を明確に改善する追加候補は見つかりませんでした。
        </p>
      )}
    </section>
  );
}

function AdvisorProgressiveExploration({
  simulation,
  profile
}: {
  simulation: AdvisorSwapSimulation;
  profile: TeamProfile;
}) {
  if (
    simulation.formChangePlans.length === 0 &&
    simulation.threatRecommendations.length === 0
  ) {
    return null;
  }
  return (
    <section
      className={styles.advisorContentBlock}
      aria-labelledby="advisor-progressive-explore-heading"
    >
      <AdvisorBlockHeading number={3} id="advisor-progressive-explore-heading">
        候補を探す
      </AdvisorBlockHeading>
      <p className={styles.advisorDetailsIntro}>
        フォーム変更や、要警戒ポケモンに合わせた対策候補も確認できます。
      </p>
      {simulation.formChangePlans.length ? (
        <AdvisorFormChangePlans
          plans={simulation.formChangePlans}
          profile={profile}
        />
      ) : null}
      {simulation.threatRecommendations.length ? (
        <AdvisorThreatExplorer simulation={simulation} />
      ) : null}
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
  canAnalyze,
  headingNumber = 1
}: {
  advisor: TeamAdvisorAnalysis;
  canAnalyze: boolean;
  headingNumber?: number;
}) {
  return (
    <section
      className={styles.advisorContentBlock}
      aria-labelledby="advisor-issues-heading"
    >
      <AdvisorBlockHeading number={headingNumber} id="advisor-issues-heading">
        現在の課題
      </AdvisorBlockHeading>
      {advisor.issues.length ? (
        <ul className={styles.advisorIssueList}>
          {advisor.issues.map((issue) => (
            <li key={issue.id}>
              <span className={styles.advisorPriorityBadge}>
                優先して改善
              </span>
              <strong>{issue.title}</strong>
              <details>
                <summary>判断の根拠</summary>
                <p>{issue.reason}</p>
              </details>
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
  profile,
  headingNumber = 2,
  headingTitle = "完成したパーティの入れ替え改善案"
}: {
  simulation: AdvisorSwapSimulation;
  canAnalyze: boolean;
  profile: TeamProfile;
  headingNumber?: number;
  headingTitle?: string;
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
      <AdvisorBlockHeading number={headingNumber} id="advisor-candidates-heading">
        {headingTitle}
      </AdvisorBlockHeading>
      {canAnalyze ? (
        <div className={styles.advisorCategoryControls}>
          <label>
            <span>候補の見方</span>
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
      ) : (
        <p className={styles.advisorEmpty} role="status">
          {canAnalyze
            ? "明確に改善する入れ替え案は見つかりませんでした。"
            : "6体揃うと入れ替え改善案を比較します。"}
        </p>
      )}
      {canAnalyze && simulation.formChangePlans.length ? (
        <AdvisorFormChangePlans
          plans={simulation.formChangePlans}
          profile={profile}
        />
      ) : null}
      {canAnalyze && simulation.threatRecommendations.length ? (
        <AdvisorThreatExplorer simulation={simulation} />
      ) : null}
    </section>
  );
}

function AdvisorFormChangePlans({
  plans,
  profile
}: {
  plans: AdvisorSwapPlan[];
  profile: TeamProfile;
}) {
  return (
    <details className={styles.advisorExplorer}>
      <summary>フォーム変更案</summary>
      <p>
        同じポケモンを別フォームへ切り替えた場合の改善だけを、追加・入れ替え案と分けて表示します。
      </p>
      <ol className={styles.advisorCandidateGrid}>
        {plans.map((plan) => (
          <li key={`${plan.action.kind}:${plan.candidate.pokemon.slug}`}>
            <AdvisorRecommendationCard
              plan={plan}
              category="overall"
              profile={profile}
            />
          </li>
        ))}
      </ol>
    </details>
  );
}

function formatPlanAction(plan: AdvisorSwapPlan): string {
  if (plan.action.kind === "add") return "空き枠へ追加";
  if (plan.action.kind === "form-change") {
    return `${plan.action.removedLabel}からフォーム変更`;
  }
  return `${plan.action.removedLabel}を抜いて採用`;
}

function formatPlanOutcomeHeading(plan: AdvisorSwapPlan): string {
  if (plan.action.kind === "add") return "加えるとどうなるか";
  if (plan.action.kind === "form-change") {
    return "フォームを変えるとどうなるか";
  }
  return "入れ替えるとどうなるか";
}

function getPlanMegaCandidateNote(plan: AdvisorSwapPlan): string | null {
  const teamState = getAdvisorMegaTeamState(plan.beforeTeam);
  const removedSlot =
    plan.action.removedSlotId === null
      ? null
      : plan.beforeTeam.find(
          (slot) => slot.id === plan.action.removedSlotId
        ) ?? null;
  const removedPokemon =
    removedSlot?.mode === "pokemon"
      ? getPokemonBySlug(removedSlot.pokemonSlug)
      : null;
  return getAdvisorMegaCandidateNote({
    currentTeamSize: teamState.currentTeamSize,
    currentMegaCount: teamState.currentMegaCount,
    candidateIsMega: plan.candidate.pokemon.formKind === "mega",
    actionKind:
      plan.action.kind === "form-change"
        ? "formChange"
        : plan.action.kind,
    removedSlotContainsPokemon:
      plan.action.removedSlotId === null
        ? undefined
        : removedSlot?.mode === "pokemon",
    removedPokemonIsMega: removedPokemon?.formKind === "mega"
  });
}

function AdvisorThreatExplorer({
  simulation
}: {
  simulation: AdvisorSwapSimulation;
}) {
  const [selectedThreatId, setSelectedThreatId] = useState(
    simulation.threatRecommendations[0]?.threat.pokemon.slug ?? ""
  );
  const [mode, setMode] =
    useState<AdvisorThreatExploreMode>("recommended");
  const [selectedType, setSelectedType] = useState<TypeName>(
    simulation.threatTypeOptions[0]?.type ?? "normal"
  );
  const selectedGroup =
    simulation.threatRecommendations.find(
      (group) => group.threat.pokemon.slug === selectedThreatId
    ) ?? simulation.threatRecommendations[0];
  const plans =
    mode === "type"
      ? selectedGroup?.typePlans[selectedType] ?? []
      : selectedGroup?.plansByMode[mode] ?? [];

  useEffect(() => {
    if (
      selectedThreatId &&
      simulation.threatRecommendations.some(
        (group) => group.threat.pokemon.slug === selectedThreatId
      )
    ) {
      return;
    }
    setSelectedThreatId(
      simulation.threatRecommendations[0]?.threat.pokemon.slug ?? ""
    );
  }, [selectedThreatId, simulation.threatRecommendations]);

  if (!selectedGroup) return null;

  return (
    <details className={styles.advisorExplorer}>
      <summary>ほかの候補を探す</summary>
      <p>
        要警戒ポケモンを1体選び、対策方法やタイプを指定して候補を比較できます。
      </p>
      <div className={styles.advisorExplorerControls}>
        <label>
          <span>対策する相手</span>
          <select
            value={selectedGroup.threat.pokemon.slug}
            onChange={(event) => setSelectedThreatId(event.target.value)}
          >
            {simulation.threatRecommendations.map((group) => (
              <option
                key={group.threat.pokemon.slug}
                value={group.threat.pokemon.slug}
              >
                {group.threat.pokemon.nameJa}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>探し方</span>
          <select
            value={mode}
            onChange={(event) =>
              setMode(event.target.value as AdvisorThreatExploreMode)
            }
          >
            <option value="recommended">おすすめ</option>
            <option value="stableSwitch">安定した受け先</option>
            <option value="revengeKill">対面・上から処理</option>
            <option value="type">タイプ別</option>
          </select>
        </label>
        {mode === "type" ? (
          <label>
            <span>候補のタイプ</span>
            <select
              value={selectedType}
              onChange={(event) =>
                setSelectedType(event.target.value as TypeName)
              }
            >
              {simulation.threatTypeOptions.map((option) => (
                <option key={option.type} value={option.type}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      {plans.length ? (
        <ol className={styles.advisorCandidateGrid}>
          {plans.map((plan) => (
            <li key={`${selectedGroup.threat.pokemon.slug}:${plan.candidate.pokemon.speciesId}`}>
              <AdvisorThreatCandidateCard
                plan={plan}
                threatId={selectedGroup.threat.pokemon.slug}
              />
            </li>
          ))}
        </ol>
      ) : (
        <p className={styles.advisorEmpty} role="status">
          この条件で明確に改善する候補は見つかりませんでした。
        </p>
      )}
    </details>
  );
}

function AdvisorThreatCandidateCard({
  plan,
  threatId
}: {
  plan: AdvisorSwapPlan;
  threatId: string;
}) {
  const answer = plan.threatCoverage.threatAnswers.find(
    (entry) => entry.threatId === threatId
  );
  if (!answer) return null;
  const explanation = buildAdvisorExplanationPresentation({
    phase: getAdvisorBuildPhase(plan.beforeTeam),
    plan,
    mode: "overall",
    selectedThreatId: threatId
  });
  if (!explanation.eligibleForPrimaryRecommendation) return null;
  const reasons = explanation.primaryReasons;
  const megaNote = getPlanMegaCandidateNote(plan);
  const targetThreat = plan.beforeThreats.find(
    (entry) => entry.pokemon.slug === threatId
  );
  const counterplay = answer.counterplayMethods
    .filter((method) => method !== "conditional" && method !== "none")
    .map(getAdvisorCounterplayMethodLabel)
    .join("・");

  return (
    <article className={styles.advisorCandidateCard}>
      <div className={styles.advisorCandidateBadges}>
        <span className={styles.advisorCategoryBadge}>
          {getAdvisorAnswerClassLabel(answer.answerClass)}
        </span>
        {megaNote ? (
          <span className={styles.advisorMegaCandidateBadge}>
            {megaNote}
          </span>
        ) : null}
      </div>
      <div className={styles.advisorCandidateHeading}>
        <PokemonVisual
          appearance="plain"
          name={plan.candidate.pokemon.nameJa}
          slug={plan.candidate.pokemon.slug}
          pokemonId={plan.candidate.pokemon.id}
          size="large"
        />
        <div className={styles.advisorCandidateIdentity}>
          <strong>{plan.candidate.pokemon.nameJa}</strong>
          <small>
            {plan.candidate.pokemon.types.map(getTypeLabel).join(" / ")}
          </small>
          <small>
            環境使用率{" "}
            {plan.threatCoverage.candidateUsage === null
              ? "データなし"
              : `${(plan.threatCoverage.candidateUsage * 100).toFixed(1)}%`}
          </small>
        </div>
      </div>
      <h4 className={styles.advisorOutcomeHeading}>
        {formatPlanOutcomeHeading(plan)}
      </h4>
      <div className={styles.advisorSwapSummary}>
        <div>
          <span>推奨する変更</span>
          <strong>{formatPlanAction(plan)}</strong>
        </div>
        <div>
          <span>対策する相手</span>
          <strong>{targetThreat?.pokemon.nameJa ?? "要警戒ポケモン"}</strong>
          <small>{counterplay || "条件付きで対策できます"}</small>
        </div>
        {plan.beforeIssues.length > 0 || plan.afterIssues.length > 0 ? (
          <div>
            <span>現在の課題</span>
            <strong>
              {plan.beforeIssues.length}件 → {plan.afterIssues.length}件
            </strong>
          </div>
        ) : null}
        <div>
          <span>対策の確かさ</span>
          <strong>
            {answer.confidence === "high"
              ? "高"
              : answer.confidence === "medium"
                ? "中"
                : "参考"}
          </strong>
        </div>
      </div>
      <div className={styles.advisorChangeGrid}>
        <AdvisorChangeList
          title="おすすめ理由"
          items={reasons}
          tone="improve"
          empty="明確な改善理由はありません。"
        />
        <AdvisorChangeList
          title="その他の改善"
          items={explanation.otherImprovements}
          tone="other"
          empty="追加の改善点はありません。"
        />
        <AdvisorChangeList
          title="注意点"
          items={explanation.cautions}
          tone="caution"
          empty="この見方では大きな注意点はありません。"
        />
      </div>
    </article>
  );
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
  const megaNote = getPlanMegaCandidateNote(plan);
  const explanation = buildAdvisorExplanationPresentation({
    phase: getAdvisorBuildPhase(plan.beforeTeam),
    plan,
    mode: category
  });
  const counterplayMethods = [...new Set(
    plan.threatCoverage.threatAnswers
      .filter((answer) => answer.answerStrength >= 0.6)
      .flatMap((answer) => answer.counterplayMethods)
      .filter((method) => method !== "conditional" && method !== "none")
  )].slice(0, 3);
  return (
    <article className={styles.advisorCandidateCard}>
      <div className={styles.advisorCandidateBadges}>
        <span className={styles.advisorCategoryBadge}>
          {categoryLabel}
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
          name={candidate.pokemon.nameJa}
          slug={candidate.pokemon.slug}
          pokemonId={candidate.pokemon.id}
          size="large"
        />
        <div className={styles.advisorCandidateIdentity}>
          <strong>{candidate.pokemon.nameJa}</strong>
          <small>
            {candidate.pokemon.types.map(getTypeLabel).join(" / ")}
          </small>
        </div>
      </div>

      <h4 className={styles.advisorOutcomeHeading}>
        {formatPlanOutcomeHeading(plan)}
      </h4>
      <div className={styles.advisorSwapSummary}>
        <div>
          <span>推奨する変更</span>
          <strong>
            {formatPlanAction(plan)}
          </strong>
        </div>
        {plan.beforeIssues.length > 0 || plan.afterIssues.length > 0 ? (
          <div>
            <span>現在の課題</span>
            <strong>
              {plan.beforeIssues.length}件 → {plan.afterIssues.length}件
            </strong>
          </div>
        ) : null}
        <div className={styles.advisorThreatCoverageSummary}>
          <span>現在の要警戒TOP5への対応</span>
          <strong>
            {plan.threatCoverage.distinctThreatCount} / {plan.threatCoverage.threatAnswers.length}体
          </strong>
          <small>
            {counterplayMethods.length
              ? counterplayMethods
                  .map(getAdvisorCounterplayMethodLabel)
                  .join("・")
              : "明確な対策方法なし"}
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
      </div>

      <div className={styles.advisorChangeGrid}>
        <AdvisorChangeList
          title="おすすめ理由"
          items={explanation.primaryReasons}
          tone="improve"
          empty="明確な改善点はありません。"
        />
        <AdvisorChangeList
          title="その他の改善"
          items={explanation.otherImprovements}
          tone="other"
          empty="追加の改善点はありません。"
        />
        <AdvisorChangeList
          title="注意点"
          items={explanation.cautions}
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
  tone: "improve" | "other" | "caution";
  empty: string;
}) {
  return (
    <div
      className={`${styles.advisorChangeList} ${
        tone === "improve"
          ? styles.advisorChangeImprove
          : tone === "other"
            ? styles.advisorChangeOther
            : styles.advisorChangeCaution
      }`}
    >
      <h4>{title}</h4>
      {items.length ? (
        <ul>
          {items.map((item, index) => (
            <li key={`${index}:${item}`}>{item}</li>
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
  canAnalyze,
  headingNumber = 3
}: {
  diagnostics: AdvisorTeamDiagnostics;
  canAnalyze: boolean;
  headingNumber?: number;
}) {
  return (
    <section
      className={styles.advisorContentBlock}
      aria-labelledby="advisor-details-heading"
    >
      <AdvisorBlockHeading number={headingNumber} id="advisor-details-heading">
        チーム詳細診断
      </AdvisorBlockHeading>
      <p className={styles.advisorDetailsIntro}>
        防御・攻撃・素早さ・タイプ補完の順に、詳しい状態を確認できます。
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
      <details className={styles.advisorDiagnosticDetails}>
        <summary>詳しい内訳</summary>
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
      </details>
    </article>
  );
}
