import type {
  ProgressiveTeamAdvisorAnalysis
} from "@/lib/progressiveTeamAdvisor";
import styles from "./TeamWorkspace.module.css";

export function AdvisorPhaseHeader({
  analysis
}: {
  analysis: ProgressiveTeamAdvisorAnalysis;
}) {
  return (
    <div className={styles.advisorPhaseHeader}>
      <div>
        <span className={styles.advisorPhaseLabel}>現在の構築段階</span>
        <strong>{analysis.presentation.title}</strong>
        <p>{analysis.presentation.description}</p>
      </div>
      <span
        className={styles.advisorPhaseCount}
        aria-label={`現在 ${analysis.memberCount} / 6体`}
      >
        現在 <strong>{analysis.memberCount}</strong> / 6体
      </span>
      {analysis.phase === "partner" && analysis.anchor ? (
        <div className={styles.advisorAnchor}>
          <span>構築の軸</span>
          <strong>{analysis.anchor.nameJa}</strong>
        </div>
      ) : null}
    </div>
  );
}
