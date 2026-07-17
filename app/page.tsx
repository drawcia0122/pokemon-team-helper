"use client";

import { useEffect, useMemo, useState } from "react";
import { CandidateComparison } from "@/components/CandidateComparison";
import { MemberTypeProfile } from "@/components/MemberTypeProfile";
import { PokemonCandidateList } from "@/components/PokemonCandidateList";
import { SeasonSelector } from "@/components/SeasonSelector";
import { TeamInput } from "@/components/TeamInput";
import { TeamInsights } from "@/components/TeamInsights";
import { TeamSummaryTable } from "@/components/TeamSummaryTable";
import { TypeCandidateList } from "@/components/TypeCandidateList";
import { getPokemonCandidateScores, getTypeCandidateScores } from "@/lib/scoring";
import { getAvailablePokemonBySeason, getSeasonMeta, getSeasonOptions } from "@/lib/regulations";
import { parseStoredTeam, serializeTeam } from "@/lib/teamStorage";
import { getAllTypes, summarizeTeam } from "@/lib/typeChart";
import type { PokemonCandidateScore, TeamSlot, TypeCandidateScore } from "@/types/pokemon";

const sampleTeam: TeamSlot[] = [
  {
    id: "slot-1",
    mode: "pokemon",
    pokemonSlug: "empoleon"
  },
  {
    id: "slot-2",
    mode: "pokemon",
    pokemonSlug: "landorus-therian"
  }
];

type CandidateSelection =
  | { kind: "type"; value: TypeCandidateScore }
  | { kind: "pokemon"; value: PokemonCandidateScore }
  | null;

export default function HomePage() {
  const [seasonId, setSeasonId] = useState("season1");
  const [team, setTeam] = useState<TeamSlot[]>(sampleTeam);
  const [selection, setSelection] = useState<CandidateSelection>(null);

  const allTypes = useMemo(() => getAllTypes(), []);
  const seasonOptions = useMemo(() => getSeasonOptions(), []);
  const seasonMeta = useMemo(() => getSeasonMeta(seasonId), [seasonId]);
  const availablePokemon = useMemo(() => getAvailablePokemonBySeason(seasonId), [seasonId]);
  const summary = useMemo(() => summarizeTeam(team), [team]);
  const typeCandidates = useMemo(() => getTypeCandidateScores(team), [team]);
  const pokemonCandidates = useMemo(
    () => getPokemonCandidateScores(team, availablePokemon),
    [team, availablePokemon]
  );

  useEffect(() => {
    const savedSeasonId = window.localStorage.getItem("pokemon-helper:seasonId");
    const savedTeam = window.localStorage.getItem("pokemon-helper:team");

    if (savedSeasonId) {
      setSeasonId(savedSeasonId);
    }

    if (savedTeam) {
      try {
        setTeam(parseStoredTeam(savedTeam));
      } catch {
        window.localStorage.removeItem("pokemon-helper:team");
      }
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("pokemon-helper:seasonId", seasonId);
    window.localStorage.setItem("pokemon-helper:team", serializeTeam(team));
  }, [seasonId, team]);

  useEffect(() => {
    setTeam((current) =>
      current.map((slot, index) => {
        if (slot.mode !== "pokemon") {
          return slot;
        }

        const isStillAllowed = availablePokemon.some((pokemon) => pokemon.slug === slot.pokemonSlug);
        if (isStillAllowed || availablePokemon.length === 0) {
          return slot;
        }

        return {
          id: slot.id || `slot-${index + 1}`,
          mode: "pokemon" as const,
          pokemonSlug: availablePokemon[0].slug
        };
      })
    );
  }, [seasonId, availablePokemon]);

  useEffect(() => {
    const topType = typeCandidates[0];
    if (topType) {
      setSelection({ kind: "type", value: topType });
    }
  }, [seasonId, team, typeCandidates]);

  function addTypeCandidateToTeam(candidate: TypeCandidateScore) {
    setTeam((current) => {
      if (current.length >= 6) {
        return current;
      }

      return [
        ...current,
        {
          id: `slot-${Date.now()}`,
          mode: "type",
          primaryType: candidate.type
        }
      ];
    });
  }

  function addPokemonCandidateToTeam(candidate: PokemonCandidateScore) {
    setTeam((current) => {
      if (current.length >= 6) {
        return current;
      }

      return [
        ...current,
        {
          id: `slot-${Date.now()}`,
          mode: "pokemon",
          pokemonSlug: candidate.pokemon.slug
        }
      ];
    });
  }

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Pokémon Champions / シーズン対応</p>
        <h1>タイプ相性補完ツール</h1>
        <p>
          2〜6体の並びから、チーム全体の弱点と耐性を可視化し、次に入れると補完になりやすい
          タイプやポケモン候補を提案します。初期版はタイプ相性を最優先に扱い、将来のシーズン追加に
          そのまま対応できる構成にしています。
        </p>
      </section>

      <div className="stack">
        <SeasonSelector
          seasonId={seasonId}
          onSeasonChange={setSeasonId}
          options={seasonOptions}
          meta={seasonMeta}
        />

        <div className="layout">
          <TeamInput
            team={team}
            onChange={setTeam}
            availablePokemon={availablePokemon}
            allTypes={allTypes}
            sampleTeam={sampleTeam}
          />

          <div className="analysis-column">
            <TeamInsights summary={summary} />
            <TeamSummaryTable summary={summary} />
            <MemberTypeProfile summary={summary} />
          </div>
        </div>

        <div className="layout lower-layout">
          <div className="analysis-column">
            <TypeCandidateList
              candidates={typeCandidates}
              selectedKey={selection?.kind === "type" ? `type:${selection.value.type}` : null}
              onSelect={(candidate) => setSelection({ kind: "type", value: candidate })}
              onAddToTeam={addTypeCandidateToTeam}
              canAddToTeam={team.length < 6}
            />
            <PokemonCandidateList
              candidates={pokemonCandidates}
              selectedKey={
                selection?.kind === "pokemon" ? `pokemon:${selection.value.pokemon.slug}` : null
              }
              onSelect={(candidate) => setSelection({ kind: "pokemon", value: candidate })}
              onAddToTeam={addPokemonCandidateToTeam}
              canAddToTeam={team.length < 6}
            />
          </div>

          <CandidateComparison selection={selection} />
        </div>
      </div>
    </main>
  );
}
