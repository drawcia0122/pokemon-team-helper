import type {
  ProgressiveTeamAdvisorAnalysis
} from "@/lib/progressiveTeamAdvisor";
import { getAdvisorTeamStatus } from "@/lib/advisorBuildPhase";
import styles from "./TeamWorkspace.module.css";

export function AdvisorPhaseHeader({
  analysis
}: {
  analysis: ProgressiveTeamAdvisorAnalysis;
}) {
  return (
    <aside
      className={styles.advisorPhaseHeader}
      aria-labelledby="advisor-team-status-heading"
    >
      <div className={styles.advisorPhaseSummary}>
        <span className={styles.advisorPhaseLabel}>現在のチーム</span>
        <strong id="advisor-team-status-heading">
          {getAdvisorTeamStatus(analysis.memberCount)}
        </strong>
      </div>
      <span
        className={styles.advisorPhaseCount}
        aria-label={`現在 ${analysis.memberCount} / 6体`}
      >
        <strong>{analysis.memberCount}</strong> / 6体
      </span>
      {analysis.phase === "partner" && analysis.anchor ? (
        <div className={styles.advisorAnchor}>
          <span>中心にするポケモン</span>
          <strong>{analysis.anchor.nameJa}</strong>
        </div>
      ) : null}
      <div className={styles.advisorMegaGuidance}>
        <span>メガシンカ候補の条件</span>
        <p>{analysis.megaGuidance.message}</p>
      </div>
    </aside>
  );
}
