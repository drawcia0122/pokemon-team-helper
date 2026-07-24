import {
  formatSemanticCombatInspection,
  inspectSemanticCombatRegistry
} from "@/scripts/lib/semanticCombatHarness";

const args = process.argv.slice(2);
const unknown = args.filter((arg) => arg !== "--json");
if (unknown.length > 0) {
  throw new Error(`不明なoptionです: ${unknown.join(", ")}`);
}

const inspection = inspectSemanticCombatRegistry();
process.stdout.write(
  args.includes("--json")
    ? `${JSON.stringify(inspection, null, 2)}\n`
    : formatSemanticCombatInspection(inspection)
);
