import { readFileSync, writeFileSync } from "node:fs";
import {
  formatRecommendationBenchmarkReport,
  runRecommendationBenchmark
} from "@/lib/recommendationBenchmark";
import type {
  RecommendationBenchmarkGolden
} from "@/types/recommendationBenchmark";

const golden = JSON.parse(
  readFileSync("benchmarks/golden.json", "utf8")
) as RecommendationBenchmarkGolden;
const result = runRecommendationBenchmark({ golden });
writeFileSync(
  "benchmark.json",
  `${JSON.stringify(result, null, 2)}\n`,
  "utf8"
);
process.stdout.write(formatRecommendationBenchmarkReport(result));
process.stdout.write("JSON: benchmark.json\n");
