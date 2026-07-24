import { readFileSync } from "node:fs";
import path from "node:path";
import {
  getAdvisorPhasePresentation,
  getAdvisorBuildPhaseForCount,
  getAdvisorTeamStatus
} from "@/lib/advisorBuildPhase";
import { getAdvisorMegaGuidance } from "@/lib/advisorMegaRecommendation";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function read(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

const sectionSource = read("components/team/TeamAdvisorSection.tsx");
const phaseHeaderSource = read("components/team/AdvisorPhaseHeader.tsx");
const candidateSource = read(
  "components/team/AdvisorNextCandidateCard.tsx"
);
const analysisSource = read("components/team/AnalysisPanels.tsx");
const advisorDiagnosticsSource = read("lib/advisorTeamDiagnostics.ts");
const styleSource = read("components/team/TeamWorkspace.module.css");
const pageSource = read("app/page.tsx");

const oldUiTerms = [
  "TASK037の入れ替えシミュレーション",
  "現在の構築段階",
  "次の候補でのメガ上限",
  "段階内の適合度",
  "総合改善量",
  "推薦モード",
  "推薦カテゴリ",
  "主ランキング",
  "Undoデータ",
  "脅威スコア"
];
const userFacingSources = [
  sectionSource,
  phaseHeaderSource,
  candidateSource,
  analysisSource,
  pageSource
];
for (const term of oldUiTerms) {
  assert(
    userFacingSources.every((source) => !source.includes(term)),
    `開発用語または内部評価が画面に残っています: ${term}`
  );
}

for (let memberCount = 0; memberCount <= 6; memberCount += 1) {
  const presentation = getAdvisorPhasePresentation(
    getAdvisorBuildPhaseForCount(memberCount),
    memberCount
  );
  const text = [
    presentation.title,
    presentation.description,
    presentation.candidateLabel
  ].join(" ");
  assert(
    !/TASK\d+|Recommendation|Evidence|trackedThreat|Threat Snapshot|phase/.test(
      text
    ),
    `${memberCount}体時の案内へ開発用語が混入しています`
  );
}

assert(
  getAdvisorTeamStatus(0) === "準備中" &&
    getAdvisorTeamStatus(1) === "構築中・あと5体" &&
    getAdvisorTeamStatus(5) === "構築中・あと1体" &&
    getAdvisorTeamStatus(6) === "完成済み",
  "登録数に応じたチーム状態を自然な表示へ変換できません"
);

assert(
  phaseHeaderSource.includes("現在のチーム") &&
    phaseHeaderSource.includes("メガシンカ候補の条件") &&
    !phaseHeaderSource.includes("analysis.presentation.title") &&
    !phaseHeaderSource.includes("analysis.presentation.description"),
  "構築状況が補助情報になっていないか、見出し説明が重複しています"
);

const advisorLayout = sectionSource.slice(
  sectionSource.indexOf("return ("),
  sectionSource.indexOf("function AdvisorPriorities")
);
assert(
  advisorLayout.indexOf("<AdvisorIssues") <
    advisorLayout.indexOf("<ProgressiveAdvisorRecommendations") &&
    advisorLayout.indexOf("<AdvisorIssues") <
      advisorLayout.indexOf("<AdvisorRecommendations") &&
    advisorLayout.indexOf("<AdvisorTeamDiagnosticsPanel") >
      advisorLayout.indexOf("<AdvisorRecommendations") &&
    advisorLayout.lastIndexOf("<AdvisorPhaseHeader") >
      advisorLayout.indexOf("<AdvisorTeamDiagnosticsPanel"),
  "課題・候補・詳細診断・構築状況の読み順が不正です"
);

assert(
  sectionSource.includes("加えるとどうなるか") &&
    sectionSource.includes("入れ替えるとどうなるか") &&
    sectionSource.includes("plan.beforeIssues.length > 0") &&
    candidateSource.includes("plan.beforeIssues.length > 0") &&
    sectionSource.includes("おすすめ理由") &&
    sectionSource.includes("その他の改善") &&
    sectionSource.includes("注意点") &&
    sectionSource.includes("<summary>判断の根拠</summary>") &&
    sectionSource.includes("<summary>詳しい内訳</summary>"),
  "結論・改善内容・詳細根拠の情報階層が不足しています"
);

assert(
  analysisSource.match(/<summary>診断の根拠<\/summary>/g)?.length === 2 &&
    !analysisSource.includes("styles.threatScore") &&
    !advisorDiagnosticsSource.includes(
      "体います。素早さ種族値を基準にした概算です。"
    ),
  "診断式または内部の脅威スコアが最初から表示されています"
);

assert(
  getAdvisorMegaGuidance([]).message.length > 0 &&
    !getAdvisorMegaGuidance([]).message.includes("上限") &&
    styleSource.includes(
      ".advisorIssueList,.advisorCandidateGrid { grid-template-columns: minmax(0,1fr);"
    ) &&
    styleSource.includes(".advisorChangeGrid { grid-template-columns: 1fr;") &&
    styleSource.includes("overflow-wrap: anywhere;"),
  "メガ説明または390px向けカード・長文折り返しが不足しています"
);

console.log(
  "[ok] TASK041 UI: 開発用語・重複見出し・内部スコアを除去し、課題→候補→改善内容→詳細→構築状況の読み順を検証しました"
);
