"use client";

import { useEffect, useMemo, useState } from "react";
import { ArticleImportPanel } from "@/components/ArticleImportPanel";
import { SiteNavigation } from "@/components/navigation/SiteNavigation";
import { AnalysisSummary, OffensiveCoveragePanel } from "@/components/team/AnalysisPanels";
import { PokemonStatsPanel } from "@/components/team/PokemonStatsPanel";
import { SeasonBar } from "@/components/team/SeasonBar";
import { TeamDetails } from "@/components/team/TeamDetails";
import { TeamAdvisorSection } from "@/components/team/TeamAdvisorSection";
import { TeamInputPanel } from "@/components/team/TeamInputPanel";
import {
  mergeImportedPokemonOptions,
  resolveArticleImport,
  selectSeasonForArticleImport,
  selectTeamForImportAction,
  selectTeamForRestoreAction,
  type ArticleImportResult
} from "@/lib/articleImport";
import { getAdvisorSwapSimulation } from "@/lib/advisorSwapSimulator";
import { addAdvisorCandidateToTeam } from "@/lib/advisorCandidateAddition";
import {
  getAdvisorNextPhaseAnnouncement,
  getAdvisorPokemonCount
} from "@/lib/advisorBuildPhase";
import { getAdvisorTeamDiagnostics } from "@/lib/advisorTeamDiagnostics";
import { getProgressiveTeamAdvisor } from "@/lib/progressiveTeamAdvisor";
import { getTeamAdvisorAnalysis } from "@/lib/teamAdvisor";
import { findThreatEnvironmentDataset } from "@/lib/environmentThreatData";
import { getTeamDiagnostics } from "@/lib/teamDiagnostics";
import { getThreatSnapshot } from "@/lib/threatSnapshot";
import {
  getAvailablePokemonBySeason,
  getLatestSeasonId,
  getSeasonMeta,
  getSeasonOptions,
  resolveStoredSeasonId
} from "@/lib/regulations";
import {
  ARTICLE_IMPORT_BACKUP_KEY,
  ADVISOR_ADD_BACKUP_KEY,
  parseStoredTeam,
  parseTeamBackup,
  SEASON_STORAGE_KEY,
  serializeTeam,
  TEAM_STORAGE_KEY
} from "@/lib/teamStorage";
import {
  resolveStoredTeamProfile,
  TEAM_PROFILE_STORAGE_KEY,
  type TeamProfile
} from "@/lib/teamProfile";
import { getAllTypes, summarizeTeam } from "@/lib/typeChart";
import type { PokemonEntry, TeamSlot } from "@/types/pokemon";
import type { ThreatEnvironmentCatalog } from "@/types/environmentThreat";
import environmentIndexData from "@/data/environment/index.json";
import type { EnvironmentSnapshotIndex } from "@/types/environmentData";
import styles from "./page.module.css";

const environmentIndex =
  environmentIndexData as EnvironmentSnapshotIndex;
const threatCatalogVersion = environmentIndex.latest
  .map((latest) =>
    environmentIndex.snapshots.find(
      (snapshot) => snapshot.snapshotId === latest.snapshotId
    )?.contentHash.slice(0, 16)
  )
  .filter(Boolean)
  .sort()
  .join("-");

export default function HomePage() {
  const [seasonId, setSeasonId] = useState(() => getLatestSeasonId());
  const [teamProfile, setTeamProfile] = useState<TeamProfile>("standard");
  const [team, setTeam] = useState<TeamSlot[]>([]);
  const [articleImport, setArticleImport] = useState<ArticleImportResult>({ status: "idle" });
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const [canRestorePreviousTeam, setCanRestorePreviousTeam] = useState(false);
  const [preserveImportedTeam, setPreserveImportedTeam] = useState(false);
  const [isRestored, setIsRestored] = useState(false);
  const [isRestoreConfirmationOpen, setIsRestoreConfirmationOpen] = useState(false);
  const [canUndoAdvisorAdd, setCanUndoAdvisorAdd] = useState(false);
  const [advisorActionNotice, setAdvisorActionNotice] = useState("");
  const [threatEnvironmentCatalog, setThreatEnvironmentCatalog] =
    useState<ThreatEnvironmentCatalog | null>(null);

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
  const diagnostics = useMemo(
    () => getTeamDiagnostics(team, summary, availablePokemon, teamProfile),
    [availablePokemon, summary, team, teamProfile]
  );
  const threatEnvironmentDataset = useMemo(
    () =>
      findThreatEnvironmentDataset(
        threatEnvironmentCatalog,
        seasonMeta.regulationId
      ),
    [seasonMeta.regulationId, threatEnvironmentCatalog]
  );
  const threatSnapshot = useMemo(
    () =>
      getThreatSnapshot({
        team,
        availablePokemon,
        environmentDataset: threatEnvironmentDataset,
        profile: teamProfile
      }),
    [availablePokemon, team, teamProfile, threatEnvironmentDataset]
  );
  const threatPokemon = threatSnapshot.currentDisplayedTop5;
  const advisor = useMemo(
    () =>
      getTeamAdvisorAnalysis({
        team,
        summary,
        diagnostics,
        threatSnapshot,
        availablePokemon,
        environmentDataset: threatEnvironmentDataset,
        profile: teamProfile
      }),
    [
      availablePokemon,
      diagnostics,
      summary,
      team,
      teamProfile,
      threatSnapshot,
      threatEnvironmentDataset
    ]
  );
  const advisorSwapSimulation = useMemo(
    () =>
      getAdvisorSwapSimulation({
        team,
        advisor,
        availablePokemon,
        environmentDataset: threatEnvironmentDataset,
        threatSnapshot,
        profile: teamProfile
      }),
    [
      advisor,
      availablePokemon,
      team,
      teamProfile,
      threatEnvironmentDataset,
      threatSnapshot
    ]
  );
  const advisorTeamDiagnostics = useMemo(
    () =>
      getAdvisorTeamDiagnostics({
        team,
        summary,
        threats: threatSnapshot.currentDisplayedTop5,
        profile: teamProfile
      }),
    [summary, team, teamProfile, threatSnapshot]
  );
  const progressiveAdvisor = useMemo(
    () =>
      getProgressiveTeamAdvisor({
        team,
        advisor,
        simulation: advisorSwapSimulation,
        availablePokemon,
        environmentDataset: threatEnvironmentDataset,
        profile: teamProfile
      }),
    [
      advisor,
      advisorSwapSimulation,
      availablePokemon,
      team,
      teamProfile,
      threatEnvironmentDataset
    ]
  );

  useEffect(() => {
    let active = true;
    void fetch(
      `environment-data/_threats.json?v=${encodeURIComponent(
        threatCatalogVersion
      )}`,
      { cache: "force-cache" }
    )
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<ThreatEnvironmentCatalog>;
      })
      .then((catalog) => {
        if (
          active &&
          catalog.schemaVersion === 1 &&
          Array.isArray(catalog.datasets)
        ) {
          setThreatEnvironmentCatalog(catalog);
        }
      })
      .catch(() => {
        if (active) setThreatEnvironmentCatalog(null);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const savedSeasonId = window.localStorage.getItem(SEASON_STORAGE_KEY);
    const savedTeam = window.localStorage.getItem(TEAM_STORAGE_KEY);
    const savedTeamProfile = window.localStorage.getItem(
      TEAM_PROFILE_STORAGE_KEY
    );

    setSeasonId(resolveStoredSeasonId(savedSeasonId));
    setTeamProfile(resolveStoredTeamProfile(savedTeamProfile));

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

    const savedAdvisorBackup = window.localStorage.getItem(
      ADVISOR_ADD_BACKUP_KEY
    );
    if (savedAdvisorBackup) {
      if (parseTeamBackup(savedAdvisorBackup)) {
        setCanUndoAdvisorAdd(true);
      } else {
        window.localStorage.removeItem(ADVISOR_ADD_BACKUP_KEY);
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
    window.localStorage.setItem(TEAM_PROFILE_STORAGE_KEY, teamProfile);
  }, [isRestored, seasonId, team, teamProfile]);

  function removeImportArticleParameter() {
    const url = new URL(window.location.href);
    url.searchParams.delete("importArticle");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function clearAdvisorAddUndo() {
    window.localStorage.removeItem(ADVISOR_ADD_BACKUP_KEY);
    setCanUndoAdvisorAdd(false);
  }

  function updateTeamFromInput(nextTeam: TeamSlot[]) {
    clearAdvisorAddUndo();
    setAdvisorActionNotice("");
    setTeam(nextTeam);
  }

  function addAdvisorCandidate(candidate: PokemonEntry) {
    const nextTeam = addAdvisorCandidateToTeam({
      team,
      candidate,
      availablePokemon
    });
    if (nextTeam.length === team.length) return;
    window.localStorage.setItem(
      ADVISOR_ADD_BACKUP_KEY,
      serializeTeam(team)
    );
    window.localStorage.setItem(TEAM_STORAGE_KEY, serializeTeam(nextTeam));
    setCanUndoAdvisorAdd(true);
    setTeam(nextTeam);
    const nextCount = getAdvisorPokemonCount(nextTeam);
    setAdvisorActionNotice(
      `${candidate.nameJa}を追加しました。おすすめ内容を「${getAdvisorNextPhaseAnnouncement(nextCount)}」へ更新しました。`
    );
  }

  function undoAdvisorCandidate() {
    const backup = parseTeamBackup(
      window.localStorage.getItem(ADVISOR_ADD_BACKUP_KEY)
    );
    if (!backup) {
      clearAdvisorAddUndo();
      setAdvisorActionNotice(
        "追加前のパーティを復元できなかったため、保存されていた取り消し情報を削除しました。"
      );
      return;
    }
    window.localStorage.setItem(TEAM_STORAGE_KEY, serializeTeam(backup));
    window.localStorage.removeItem(ADVISOR_ADD_BACKUP_KEY);
    setCanUndoAdvisorAdd(false);
    setTeam(backup);
    setAdvisorActionNotice(
      `追加を元に戻しました。おすすめ内容を「${getAdvisorNextPhaseAnnouncement(
        getAdvisorPokemonCount(backup)
      )}」へ更新しました。`
    );
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
    clearAdvisorAddUndo();

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
    clearAdvisorAddUndo();
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
          onChange={updateTeamFromInput}
          profile={teamProfile}
          onProfileChange={setTeamProfile}
          availablePokemon={availablePokemon}
          pokemonInputOptions={pokemonInputOptions}
          allTypes={allTypes}
        />

        <PokemonStatsPanel team={team} />

        <AnalysisSummary
          summary={summary}
          slotCount={team.length}
          diagnostics={diagnostics}
          threatPokemon={threatPokemon}
        />
        {summary.members.length >= 2 ? (
          <OffensiveCoveragePanel summary={summary} />
        ) : null}
        <TeamAdvisorSection
          advisor={advisor}
          simulation={advisorSwapSimulation}
          teamDiagnostics={advisorTeamDiagnostics}
          profile={teamProfile}
          canAnalyze={summary.members.length >= 2}
          progressive={progressiveAdvisor}
          team={team}
          availablePokemon={availablePokemon}
          onAddCandidate={addAdvisorCandidate}
          onUndoCandidate={undoAdvisorCandidate}
          canUndoCandidate={canUndoAdvisorAdd}
          actionNotice={advisorActionNotice}
        />
        {summary.members.length >= 2 ? (
          <TeamDetails summary={summary} />
        ) : null}
      </div>
    </main>
  );
}
