"use client";

import { useEffect, useMemo, useState } from "react";
import { ArticleImportPanel } from "@/components/ArticleImportPanel";
import { SiteNavigation } from "@/components/navigation/SiteNavigation";
import { AnalysisSummary, OffensiveCoveragePanel } from "@/components/team/AnalysisPanels";
import { RecommendationPanel } from "@/components/team/RecommendationPanel";
import { SeasonBar } from "@/components/team/SeasonBar";
import { TeamDetails } from "@/components/team/TeamDetails";
import { TeamInputPanel } from "@/components/team/TeamInputPanel";
import {
  mergeImportedPokemonOptions,
  resolveArticleImport,
  selectSeasonForArticleImport,
  selectTeamForImportAction,
  selectTeamForRestoreAction,
  type ArticleImportResult
} from "@/lib/articleImport";
import { getPokemonCandidateScores, getTypeCandidateScores } from "@/lib/scoring";
import {
  getAvailablePokemonBySeason,
  getLatestSeasonId,
  getSeasonMeta,
  getSeasonOptions,
  resolveStoredSeasonId
} from "@/lib/regulations";
import type { CandidateSelection } from "@/lib/teamUi";
import {
  ARTICLE_IMPORT_BACKUP_KEY,
  parseStoredTeam,
  parseTeamBackup,
  SEASON_STORAGE_KEY,
  serializeTeam,
  TEAM_STORAGE_KEY
} from "@/lib/teamStorage";
import { getAllTypes, summarizeTeam } from "@/lib/typeChart";
import type { PokemonCandidateScore, TeamSlot, TypeCandidateScore } from "@/types/pokemon";
import styles from "./page.module.css";

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

export default function HomePage() {
  const [seasonId, setSeasonId] = useState(() => getLatestSeasonId());
  const [team, setTeam] = useState<TeamSlot[]>(sampleTeam);
  const [selection, setSelection] = useState<CandidateSelection>(null);
  const [articleImport, setArticleImport] = useState<ArticleImportResult>({ status: "idle" });
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const [canRestorePreviousTeam, setCanRestorePreviousTeam] = useState(false);
  const [preserveImportedTeam, setPreserveImportedTeam] = useState(false);
  const [isRestored, setIsRestored] = useState(false);
  const [isRestoreConfirmationOpen, setIsRestoreConfirmationOpen] = useState(false);

  const allTypes = useMemo(() => getAllTypes(), []);
  const seasonOptions = useMemo(() => getSeasonOptions(), []);
  const seasonMeta = useMemo(() => getSeasonMeta(seasonId), [seasonId]);
  const availablePokemon = useMemo(() => getAvailablePokemonBySeason(seasonId), [seasonId]);
  const pokemonInputOptions = useMemo(
    () =>
      preserveImportedTeam
        ? mergeImportedPokemonOptions(availablePokemon, team)
        : availablePokemon,
    [availablePokemon, preserveImportedTeam, team]
  );
  const summary = useMemo(() => summarizeTeam(team), [team]);
  const typeCandidates = useMemo(() => getTypeCandidateScores(team), [team]);
  const pokemonCandidates = useMemo(
    () => getPokemonCandidateScores(team, availablePokemon),
    [team, availablePokemon]
  );

  useEffect(() => {
    const savedSeasonId = window.localStorage.getItem(SEASON_STORAGE_KEY);
    const savedTeam = window.localStorage.getItem(TEAM_STORAGE_KEY);

    setSeasonId(resolveStoredSeasonId(savedSeasonId));

    if (savedTeam) {
      try {
        setTeam(parseStoredTeam(savedTeam));
      } catch {
        window.localStorage.removeItem(TEAM_STORAGE_KEY);
      }
    }

    const savedBackup = window.localStorage.getItem(ARTICLE_IMPORT_BACKUP_KEY);
    if (savedBackup) {
      if (parseTeamBackup(savedBackup)) {
        setCanRestorePreviousTeam(true);
        setPreserveImportedTeam(true);
        setImportNotice("構築記事から読み込んだパーティです");
      } else {
        window.localStorage.removeItem(ARTICLE_IMPORT_BACKUP_KEY);
      }
    }

    const params = new URLSearchParams(window.location.search);
    setArticleImport(resolveArticleImport(params.get("importArticle")));
    setIsRestored(true);
  }, []);

  useEffect(() => {
    if (!isRestored) {
      return;
    }

    window.localStorage.setItem(
      SEASON_STORAGE_KEY,
      resolveStoredSeasonId(seasonId)
    );
    window.localStorage.setItem(TEAM_STORAGE_KEY, serializeTeam(team));
  }, [isRestored, seasonId, team]);

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

  function removeImportArticleParameter() {
    const url = new URL(window.location.href);
    url.searchParams.delete("importArticle");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function cancelArticleImport() {
    if (articleImport.status === "ready") {
      setTeam((current) => selectTeamForImportAction(current, articleImport.team, "cancel"));
    }
    setArticleImport({ status: "idle" });
    removeImportArticleParameter();
  }

  function confirmArticleImport(mode: "article" | "current") {
    if (articleImport.status !== "ready") {
      return;
    }

    const importedTeam = selectTeamForImportAction(team, articleImport.team, "confirm");
    const targetSeasonId = selectSeasonForArticleImport(
      articleImport.article,
      seasonId,
      mode
    );

    window.localStorage.setItem(ARTICLE_IMPORT_BACKUP_KEY, serializeTeam(team));
    window.localStorage.setItem(TEAM_STORAGE_KEY, serializeTeam(importedTeam));
    window.localStorage.setItem(
      SEASON_STORAGE_KEY,
      resolveStoredSeasonId(targetSeasonId)
    );

    setPreserveImportedTeam(true);
    setCanRestorePreviousTeam(true);
    setTeam(importedTeam);
    setSeasonId(targetSeasonId);
    setArticleImport({ status: "idle" });
    setImportNotice("構築記事から6体を読み込みました");
    removeImportArticleParameter();
  }

  function restorePreviousTeam() {
    const backup = parseTeamBackup(window.localStorage.getItem(ARTICLE_IMPORT_BACKUP_KEY));

    if (!backup) {
      window.localStorage.removeItem(ARTICLE_IMPORT_BACKUP_KEY);
      setCanRestorePreviousTeam(false);
      setIsRestoreConfirmationOpen(false);
      setImportNotice("元のパーティを復元できなかったため、壊れた退避データを破棄しました");
      return;
    }

    const restoredTeam = selectTeamForRestoreAction(team, backup, "restore");
    window.localStorage.setItem(TEAM_STORAGE_KEY, serializeTeam(restoredTeam));
    window.localStorage.removeItem(ARTICLE_IMPORT_BACKUP_KEY);
    setPreserveImportedTeam(true);
    setCanRestorePreviousTeam(false);
    setIsRestoreConfirmationOpen(false);
    setTeam(restoredTeam);
    setImportNotice("元のパーティに戻しました");
  }

  function cancelRestorePreviousTeam() {
    setTeam((current) => selectTeamForRestoreAction(current, current, "cancel"));
    setIsRestoreConfirmationOpen(false);
  }

  return (
    <main className={styles.page}>
      <SiteNavigation active="team" />
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>POKÉMON TEAM ANALYZER</p>
          <h1>パーティ構築補助</h1>
        </div>
        <p>
          パーティを入力して、弱点・攻撃範囲・次に入れたい補完候補を順番に確認できます。
        </p>
      </section>

      <div className={styles.workspace}>
        <SeasonBar
          seasonId={seasonId}
          onSeasonChange={setSeasonId}
          options={seasonOptions}
          meta={seasonMeta}
        />

      {articleImport.status !== "idle" ? (
        <ArticleImportPanel
          request={articleImport}
          currentSeasonId={seasonId}
          currentSeasonLabel={seasonMeta.label}
          availablePokemon={availablePokemon}
          onConfirm={confirmArticleImport}
          onCancel={cancelArticleImport}
        />
      ) : null}

      {importNotice ? (
        <aside className={styles.importNotice} role="status">
          <strong>{importNotice}</strong>
          <div>
            {canRestorePreviousTeam ? (
              <button type="button" onClick={() => setIsRestoreConfirmationOpen(true)}>
                元のパーティに戻す
              </button>
            ) : null}
            <button type="button" onClick={() => setImportNotice(null)}>
              閉じる
            </button>
          </div>
          {isRestoreConfirmationOpen ? (
            <div className={styles.restoreConfirmation} role="alert">
              <p>
                現在のパーティは失われます。
                <br />
                構築記事を読み込む前のパーティへ戻しますか？
              </p>
              <div>
                <button type="button" onClick={restorePreviousTeam}>
                  復元する
                </button>
                <button type="button" onClick={cancelRestorePreviousTeam}>
                  キャンセル
                </button>
              </div>
            </div>
          ) : null}
        </aside>
      ) : null}

        <TeamInputPanel
          team={team}
          onChange={setTeam}
          availablePokemon={availablePokemon}
          pokemonInputOptions={pokemonInputOptions}
          allTypes={allTypes}
          sampleTeam={sampleTeam}
        />

        <AnalysisSummary summary={summary} slotCount={team.length} />
        {summary.members.length >= 2 ? (
          <>
            <OffensiveCoveragePanel summary={summary} />
            <RecommendationPanel
              typeCandidates={typeCandidates}
              pokemonCandidates={pokemonCandidates}
              selection={selection}
              onSelect={setSelection}
              onAddType={addTypeCandidateToTeam}
              onAddPokemon={addPokemonCandidateToTeam}
              canAdd={team.length < 6}
            />
            <TeamDetails summary={summary} />
          </>
        ) : null}
      </div>
    </main>
  );
}
