import { buildIntegratedRecommendationRuntime } from "@/lib/recommendationIntegrationRuntime";
import { buildRecommendationAnalyzerFixture } from "@/scripts/lib/recommendationAnalyzerHarness";
import type { TeamProfile } from "@/lib/teamProfile";

export function buildGoalBuilderFixture({
  teamSlugs,
  regulation = "M-B",
  profile = "standard"
}: {
  teamSlugs: string[];
  regulation?: string;
  profile?: TeamProfile;
}) {
  const fixture = buildRecommendationAnalyzerFixture({
    teamSlugs,
    regulation,
    profile,
    topLimit: 100
  });
  const runtime = buildIntegratedRecommendationRuntime({
    input: {
      team: fixture.team,
      advisor: fixture.advisor,
      availablePokemon: fixture.analyzerInput.availablePokemon,
      environmentDataset: fixture.analyzerInput.environmentDataset,
      threatSnapshot: fixture.threatSnapshot,
      profile
    },
    baseline: fixture.simulation,
    environmentSnapshot: fixture.analyzerInput.environmentSnapshot
  });
  if (!runtime) {
    throw new Error("Goal-Oriented Team Builder runtimeを生成できません。");
  }
  return { fixture, runtime };
}
