import { bucketLabels, getTypeLabel } from "@/lib/typeChart";
import type { DefensiveBucket, TeamSummary } from "@/types/pokemon";

const displayBuckets: DefensiveBucket[] = ["quadWeak", "weak", "resist", "doubleResist", "immune"];

export function MemberTypeProfile({ summary }: { summary: TeamSummary }) {
  return (
    <section className="panel">
      <div className="panel-inner">
        <div className="section-title">
          <div>
            <h2>各メンバーの相性</h2>
            <p>4倍・2倍・半減・1/4・無効をメンバーごとに確認できます。</p>
          </div>
        </div>

        <div className="candidate-list">
          {summary.memberProfiles.map((profile) => (
            <article key={profile.member.slotId} className="candidate">
              <h4>{profile.member.label}</h4>
              <p>{profile.member.types.map(getTypeLabel).join(" / ")}</p>
              <div className="profile-groups">
                {displayBuckets.map((bucket) => (
                  <div key={bucket}>
                    <strong>{bucketLabels[bucket]}</strong>
                    <div className="mini-list">
                      {profile.byMultiplier[bucket].length > 0 ? (
                        profile.byMultiplier[bucket].map((typeName) => (
                          <span key={typeName} className={`pill ${bucket === "quadWeak" || bucket === "weak" ? "bad" : "good"}`}>
                            {getTypeLabel(typeName)}
                          </span>
                        ))
                      ) : (
                        <span className="helper-text">なし</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
