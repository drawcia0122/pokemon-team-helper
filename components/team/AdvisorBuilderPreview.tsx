import type { GoalOrientedCandidatePlan } from "@/types/goalOrientedTeamBuilder";
import styles from "./TeamWorkspace.module.css";

function scoreLabel(value: number): string {
  if (value >= 75) return "つながりやすい";
  if (value >= 55) return "組み立てやすい";
  return "補完候補を慎重に選ぶ";
}

export function AdvisorBuilderPreview({
  plan,
  showExplanations = true
}: {
  plan: GoalOrientedCandidatePlan | null | undefined;
  showExplanations?: boolean;
}) {
  if (!plan || plan.remainingSlotsAfterCandidate === 0) return null;
  return (
    <section
      className={styles.advisorBuilderPreview}
      aria-label="この候補を選んだ後の構築イメージ"
    >
      <div className={styles.advisorBuilderHeading}>
        <h4>この候補を選んだ後</h4>
        <span>{scoreLabel(plan.futurePotential)}</span>
      </div>
      <p className={styles.advisorBuilderGoal}>
        <span>完成形イメージ</span>
        <strong>{plan.selectedGoal.label}</strong>
      </p>
      {showExplanations && plan.explanations.length ? (
        <ul className={styles.advisorBuilderReasons}>
          {plan.explanations.slice(0, 3).map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
      {plan.nextCandidates.length ? (
        <div className={styles.advisorBuilderNext}>
          <strong>次におすすめ</strong>
          <ol>
            {plan.nextCandidates.map((candidate) => (
              <li key={candidate.slug}>
                <span>{candidate.name}</span>
                <small>{candidate.reasons[0]}</small>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <p className={styles.advisorBuilderCaution}>
          次の役割を自然に補える候補が限られています。
        </p>
      )}
      <details className={styles.advisorBuilderDetails}>
        <summary>完成までの見通し</summary>
        <dl>
          <div>
            <dt>将来の組み立てやすさ</dt>
            <dd>{plan.futurePotential.toFixed(0)} / 100</dd>
          </div>
          <div>
            <dt>コアのまとまり</dt>
            <dd>{plan.coreQuality.overall.toFixed(0)} / 100</dd>
          </div>
          <div>
            <dt>行き止まりの心配</dt>
            <dd>{plan.deadEndRisk.toFixed(0)} / 100</dd>
          </div>
        </dl>
        {plan.chain.length ? (
          <>
            <strong>完成までの候補例</strong>
            <ol>
              {plan.chain.map((step) => (
                <li key={`${step.step}:${step.slug}`}>
                  {step.step}手目: {step.name}
                </li>
              ))}
            </ol>
          </>
        ) : null}
        {plan.cautions.length ? (
          <ul className={styles.advisorBuilderCaution}>
            {plan.cautions.map((caution) => (
              <li key={caution}>{caution}</li>
            ))}
          </ul>
        ) : null}
      </details>
    </section>
  );
}
