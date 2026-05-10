import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Award,
  Brain,
  Gamepad2,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Trophy,
  UserRound,
  Zap
} from "lucide-react";
import { createPlayer, getLeaderboard, getPlayerAchievements, listGames, submitScore } from "./lib/api.js";
import { MemoryMatch } from "./components/MemoryMatch.jsx";
import { ReactionSpeed } from "./components/ReactionSpeed.jsx";

const gameIcons = {
  "reaction-speed": Zap,
  "memory-match": Brain
};

const badgeIcons = {
  award: Award,
  brain: Brain,
  zap: Zap
};

const avatarColors = ["#14b8a6", "#f97316", "#e11d48", "#8b5cf6", "#22c55e", "#0ea5e9"];
const playerStorageKey = "bytebattle-player";

function getLocalStorage() {
  try {
    const storage = window.localStorage;
    const probeKey = "bytebattle-storage-check";
    storage.setItem(probeKey, "ok");
    storage.removeItem(probeKey);
    return storage;
  } catch (_error) {
    return null;
  }
}

function readSavedPlayer() {
  const storage = getLocalStorage();
  if (!storage) return null;

  try {
    const saved = storage.getItem(playerStorageKey);
    if (!saved) return null;
    const player = JSON.parse(saved);
    if (!player?.id || !player?.displayName) return null;
    return {
      id: String(player.id),
      displayName: String(player.displayName),
      avatarColor: avatarColors.includes(player.avatarColor) ? player.avatarColor : avatarColors[0]
    };
  } catch (_error) {
    try {
      storage.removeItem(playerStorageKey);
    } catch (_removeError) {
      return null;
    }
    return null;
  }
}

function savePlayer(player) {
  const storage = getLocalStorage();
  if (!storage) return;

  try {
    storage.setItem(playerStorageKey, JSON.stringify(player));
  } catch (_error) {
    // The app still works for the current session if local persistence is unavailable.
  }
}

function formatScore(gameSlug, value) {
  if (gameSlug === "reaction-speed") {
    return `${value} ms`;
  }
  return `${value.toLocaleString()} pts`;
}

export default function App() {
  const [games, setGames] = useState([]);
  const [selectedGame, setSelectedGame] = useState("reaction-speed");
  const [player, setPlayer] = useState(readSavedPlayer);
  const [leaderboard, setLeaderboard] = useState([]);
  const [playerName, setPlayerName] = useState(player?.displayName || "");
  const [avatarColor, setAvatarColor] = useState(player?.avatarColor || avatarColors[0]);
  const [achievements, setAchievements] = useState([]);
  const [status, setStatus] = useState("Ready for battle.");
  const [isBusy, setIsBusy] = useState(false);

  const currentGame = useMemo(
    () => games.find((game) => game.slug === selectedGame),
    [games, selectedGame]
  );

  async function refreshLeaderboard(gameSlug = selectedGame) {
    try {
      const data = await getLeaderboard(gameSlug);
      setLeaderboard(data.leaderboard || []);
    } catch (error) {
      setStatus(`Leaderboard unavailable: ${error.message}`);
    }
  }

  async function refreshAchievements(playerId = player?.id) {
    if (!playerId) {
      setAchievements([]);
      return;
    }

    try {
      const data = await getPlayerAchievements(playerId);
      setAchievements(data.achievements || []);
    } catch (error) {
      setStatus(`Badges unavailable: ${error.message}`);
    }
  }

  useEffect(() => {
    let active = true;
    listGames()
      .then((data) => {
        if (!active) return;
        setGames(data.games || []);
        if (data.games?.[0] && !selectedGame) {
          setSelectedGame(data.games[0].slug);
        }
      })
      .catch((error) => setStatus(`Game service unavailable: ${error.message}`));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (selectedGame) {
      refreshLeaderboard(selectedGame);
    }
  }, [selectedGame]);

  useEffect(() => {
    refreshAchievements(player?.id);
  }, [player?.id]);

  async function handleCreatePlayer(event) {
    event.preventDefault();
    const cleanName = playerName.trim();
    if (!cleanName) {
      setStatus("Choose a player name before submitting scores.");
      return;
    }

    setIsBusy(true);
    try {
      const data = await createPlayer(cleanName, avatarColor);
      setPlayer(data.player);
      savePlayer(data.player);
      setStatus(`Profile locked in for ${data.player.displayName}.`);
      await refreshAchievements(data.player.id);
    } catch (error) {
      setStatus(`Could not save player: ${error.message}`);
    } finally {
      setIsBusy(false);
    }
  }

  async function handleScore(score) {
    if (!player) {
      setStatus("Create a player profile first so the leaderboard knows who you are.");
      return;
    }

    setIsBusy(true);
    try {
      const data = await submitScore({
        playerId: player.id,
        gameSlug: selectedGame,
        ...score
      });
      if (data.awardedAchievements?.length) {
        setAchievements((current) => {
          const seen = new Set(current.map((achievement) => achievement.code));
          return [...data.awardedAchievements.filter((achievement) => !seen.has(achievement.code)), ...current];
        });
        setStatus(
          `Score submitted: ${formatScore(selectedGame, data.score.scoreValue)}. Badge unlocked: ${data.awardedAchievements[0].title}.`
        );
      } else {
        setStatus(`Score submitted: ${formatScore(selectedGame, data.score.scoreValue)}.`);
      }
      await refreshLeaderboard(selectedGame);
      await refreshAchievements(player.id);
    } catch (error) {
      setStatus(`Score rejected: ${error.message}`);
    } finally {
      setIsBusy(false);
    }
  }

  const GameComponent = selectedGame === "memory-match" ? MemoryMatch : ReactionSpeed;

  return (
    <main className="app-shell">
      <aside className="rail" aria-label="ByteBattle controls">
        <div className="brand-mark">
          <Gamepad2 size={28} />
        </div>
        <button className="rail-button active" title="Arena">
          <Trophy size={20} />
        </button>
        <button className="rail-button" title="Status">
          <Activity size={20} />
        </button>
        <button className="rail-button" title="Security">
          <ShieldCheck size={20} />
        </button>
      </aside>

      <section className="workspace">
        <header className="hero-bar">
          <div>
            <p className="eyebrow">USFarcade presents</p>
            <h1>ByteBattle Arena</h1>
            <p className="hero-copy">
              A small arcade with a real cloud architecture story behind every score.
            </p>
          </div>
          <div className="system-strip" aria-label="system status">
            <span><Sparkles size={16} /> Dev</span>
            <span>QA</span>
            <span>UAT</span>
            <span>Prod</span>
          </div>
        </header>

        <section className="dashboard-grid">
          <div className="panel profile-panel">
            <div className="panel-heading">
              <UserRound size={20} />
              <h2>Player</h2>
            </div>
            <form onSubmit={handleCreatePlayer} className="profile-form">
              <label>
                Name
                <input
                  value={playerName}
                  onChange={(event) => setPlayerName(event.target.value)}
                  placeholder="Ada Lovelace"
                  maxLength={32}
                />
              </label>
              <div className="swatches" aria-label="Avatar color">
                {avatarColors.map((color) => (
                  <button
                    type="button"
                    key={color}
                    className={color === avatarColor ? "swatch selected" : "swatch"}
                    style={{ "--swatch": color }}
                    onClick={() => setAvatarColor(color)}
                    aria-label={`Use avatar color ${color}`}
                  />
                ))}
              </div>
              <button className="primary-action" type="submit" disabled={isBusy}>
                <Send size={16} />
                Save
              </button>
            </form>
            {player && (
              <div className="profile-summary">
                <div className="player-chip">
                  <span style={{ backgroundColor: player.avatarColor }} />
                  {player.displayName}
                </div>
                <div className="badge-shelf" aria-label="Player badges">
                  <div className="badge-heading">
                    <Award size={16} />
                    <span>Badges</span>
                  </div>
                  {achievements.length > 0 ? (
                    <ul>
                      {achievements.map((achievement) => {
                        const Icon = badgeIcons[achievement.icon] || Award;
                        return (
                          <li key={achievement.code} className={`badge-card ${achievement.rarity}`}>
                            <Icon size={16} />
                            <span>
                              <strong>{achievement.title}</strong>
                              <small>{achievement.description}</small>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p>No badges yet. A clean run can change that.</p>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="panel game-picker">
            <div className="panel-heading">
              <Gamepad2 size={20} />
              <h2>Games</h2>
            </div>
            <div className="game-tabs" role="tablist" aria-label="Choose game">
              {games.map((game) => {
                const Icon = gameIcons[game.slug] || Gamepad2;
                return (
                  <button
                    key={game.slug}
                    className={selectedGame === game.slug ? "game-tab selected" : "game-tab"}
                    onClick={() => setSelectedGame(game.slug)}
                    type="button"
                  >
                    <Icon size={18} />
                    <span>{game.title}</span>
                  </button>
                );
              })}
            </div>
            <p>{currentGame?.summary || "Loading games..."}</p>
          </div>

          <div className="panel arena-panel">
            <div className="panel-heading">
              <Zap size={20} />
              <h2>{currentGame?.title || "Arena"}</h2>
            </div>
            <GameComponent disabled={isBusy} onScore={handleScore} />
          </div>

          <div className="panel leaderboard-panel">
            <div className="panel-heading split">
              <span>
                <Trophy size={20} />
                <h2>Leaderboard</h2>
              </span>
              <button className="icon-button" onClick={() => refreshLeaderboard()} title="Refresh leaderboard">
                <RefreshCw size={16} />
              </button>
            </div>
            <ol className="leaderboard-list">
              {leaderboard.map((entry) => (
                <li key={entry.id}>
                  <span className="rank">#{entry.rank}</span>
                  <span className="name">{entry.displayName}</span>
                  <strong>{formatScore(selectedGame, entry.scoreValue)}</strong>
                </li>
              ))}
            </ol>
            {leaderboard.length === 0 && <p className="empty-state">No scores yet. First blood is still available.</p>}
          </div>
        </section>

        <footer className="status-bar">
          <span>{status}</span>
          <span>{isBusy ? "Syncing..." : "Online when services are healthy"}</span>
        </footer>
      </section>
    </main>
  );
}
