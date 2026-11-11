import { useEffect, useMemo, useState } from 'react';
import { IconBack } from './icons';
import { Engine } from './engine';
import { quickGameStats } from './analysis';
import { loadGames, outcomeOf, ratingHistory, recordLine, rivals, setGameStats, type SavedGame } from './games';
import { BOSSES, loadLadder } from './ladder';
import { dailyStatus } from './daily';

interface Props {
  onExit: () => void;
  onReview: (g: SavedGame) => void;
}

const W = 520;
const H = 150;

/** Simple line chart of values over time. */
function LineChart({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return <p className="trainer-note">Play a couple of games against the computer to see this chart.</p>;
  const min = Math.min(...values) - 40;
  const max = Math.max(...values) + 40;
  const x = (i: number) => (i / (values.length - 1)) * W;
  const y = (v: number) => H - ((v - min) / (max - min)) * H;
  const path = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${path} L${W},${H} L0,${H} Z`;
  return (
    <svg className="progress-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label}>
      <path d={area} className="pc-area" />
      <path d={path} className="pc-line" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r="4" className="pc-dot" />
    </svg>
  );
}

/** Bars for the last games' accuracy, with blunders marked underneath. */
function GameBars({ games, onPick }: { games: SavedGame[]; onPick: (g: SavedGame) => void }) {
  return (
    <div className="bars" role="list">
      {games.map((g) => {
        const acc = g.stats?.accuracy;
        const o = outcomeOf(g);
        return (
          <button
            key={g.id}
            role="listitem"
            className={`bar ${o}`}
            onClick={() => onPick(g)}
            title={`${new Date(g.date).toLocaleDateString()} vs ${g.opponent}: ${o}${acc !== undefined ? `, ${acc}% accuracy, ${g.stats!.blunders} blunders` : ', analyzing…'}`}
          >
            <span className="bar-fill" style={{ height: `${acc ?? 0}%` }} />
            <span className="bar-blunders">{g.stats ? '•'.repeat(Math.min(4, g.stats.blunders)) : ''}</span>
          </button>
        );
      })}
    </div>
  );
}

export function ProgressScreen({ onExit, onReview }: Props) {
  const [games, setGames] = useState(loadGames);
  const [analyzing, setAnalyzing] = useState(0);

  // Analyze recent games that don't have stats yet, newest first.
  useEffect(() => {
    const todo = loadGames()
      .slice(0, 20)
      .filter((g) => !g.stats);
    if (!todo.length) return;
    const engine = new Engine();
    let cancelled = false;
    setAnalyzing(todo.length);
    (async () => {
      for (const g of todo) {
        const stats = await quickGameStats(engine, g.moves, g.player).catch(() => null);
        if (cancelled) return;
        if (stats) setGameStats(g.id, stats);
        setGames(loadGames());
        setAnalyzing((n) => n - 1);
      }
    })();
    return () => {
      cancelled = true;
      engine.destroy();
    };
  }, []);

  const rating = useMemo(() => ratingHistory(games), [games]);
  const current = rating.length ? rating[rating.length - 1].rating : null;
  const tenAgo = rating.length > 10 ? rating[rating.length - 11].rating : rating[0]?.rating;
  const change = current !== null && tenAgo !== undefined ? current - tenAgo : 0;

  const totals = useMemo(() => {
    const t = { wins: 0, losses: 0, draws: 0 };
    for (const g of games) {
      const o = outcomeOf(g);
      if (o === 'win') t.wins++;
      else if (o === 'loss') t.losses++;
      else t.draws++;
    }
    return t;
  }, [games]);

  const recent = games.slice(0, 20).reverse();
  const withStats = games.filter((g) => g.stats).slice(0, 10);
  const avgAcc = withStats.length ? Math.round(withStats.reduce((s, g) => s + g.stats!.accuracy, 0) / withStats.length) : null;
  const avgBlunders = withStats.length ? (withStats.reduce((s, g) => s + g.stats!.blunders, 0) / withStats.length).toFixed(1) : null;

  const ladder = loadLadder();
  const daily = dailyStatus();
  const friends = rivals(games);

  return (
    <div className="game-screen progress-screen">
      <header className="topbar">
        <button className="text-btn" onClick={onExit}>
          <IconBack /> Menu
        </button>
        <span className="topbar-title">Your progress</span>
        <span />
      </header>
      <div className="progress-body">
        <section className="pcard wide">
          <div className="pcard-head">
            <h3>Estimated rating</h3>
            {current !== null && change !== 0 && (
              <span className={`delta ${change > 0 ? 'up' : 'down'}`}>
                {change > 0 ? '▲' : '▼'} {Math.abs(change)} over the last {Math.min(10, rating.length - 1)} games
              </span>
            )}
          </div>
          <p className="big-number">{current ?? '—'}</p>
          <LineChart values={rating.map((p) => p.rating)} label="Estimated rating over time" />
          <p className="trainer-note">
            Based on your results against the computer and the ladder, using each opponent’s rating. It’s an estimate,
            not an official rating.
          </p>
        </section>

        <section className="pcard">
          <h3>Record</h3>
          <p className="big-number">{recordLine(totals)}</p>
          <p className="trainer-note">Wins, losses{totals.draws ? ' and draws' : ''} across all {games.length} saved games.</p>
        </section>

        <section className="pcard">
          <h3>Last 10 games</h3>
          <div className="stat-pair">
            <span>
              <strong>{avgAcc ?? '—'}{avgAcc !== null && '%'}</strong> accuracy
            </span>
            <span>
              <strong>{avgBlunders ?? '—'}</strong> blunders per game
            </span>
          </div>
          {analyzing > 0 && <p className="trainer-note">Analyzing {analyzing} {analyzing === 1 ? 'game' : 'games'}…</p>}
        </section>

        <section className="pcard wide">
          <h3>Accuracy by game</h3>
          {recent.length ? (
            <>
              <GameBars games={recent} onPick={onReview} />
              <p className="trainer-note">
                Oldest on the left. Green bars are wins, red are losses. Dots under a bar are blunders. Click a bar to
                review that game.
              </p>
            </>
          ) : (
            <p className="trainer-note">Finish a game and it will show up here.</p>
          )}
        </section>

        <section className="pcard">
          <h3>Ladder</h3>
          <p className="big-number">
            {ladder.beaten.length}
            <span className="of"> / 8</span>
          </p>
          <div className="mini-ladder" aria-hidden>
            {BOSSES.map((b) => (
              <span key={b.rank} className={ladder.beaten.includes(b.rank) ? 'on' : ''} title={b.name} />
            ))}
          </div>
        </section>

        <section className="pcard">
          <h3>Daily puzzle</h3>
          <p className="big-number">
            {daily.streak}
            <span className="of"> day streak</span>
          </p>
          <p className="trainer-note">
            Best streak {daily.best}. {daily.solvedCount} solved in total.
          </p>
        </section>

        <section className="pcard wide">
          <h3>Head to head</h3>
          {friends.length ? (
            <ul className="rivals">
              {friends.map((r) => (
                <li key={r.name}>
                  <span className="rival-name">{r.name}</span>
                  <span className="rival-record">{recordLine(r)}</span>
                  <span className="trainer-note">last played {new Date(r.last).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="trainer-note">Play a friend online and your record against them will show up here.</p>
          )}
        </section>
      </div>
    </div>
  );
}
