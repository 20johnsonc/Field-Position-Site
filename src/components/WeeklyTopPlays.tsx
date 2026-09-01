import { useEffect, useMemo, useRef, useState } from 'react';
import { type GameMeta, type TaggedPlay, getTopPlays, getPlayImpact, formatEpa } from '../lib/pbp';
import { loadWeekPbpData } from '../lib/pbpClient';

interface UseWeekTopPlaysResult {
  loading: boolean;
  error: string | null;
  weekTop: TaggedPlay[];
  byGameTop: Map<string, TaggedPlay[]>;
}

// Client-side variant — fetches over HTTP. Use this only on pages that
// aren't already computing plays server-side in Astro frontmatter.
export function usePbpWeekTopPlays(games: GameMeta[], limit = 10): UseWeekTopPlaysResult {
  const [weekTop, setWeekTop] = useState<TaggedPlay[]>([]);
  const [byGameTop, setByGameTop] = useState<Map<string, TaggedPlay[]>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gamesKey = useMemo(() => games.map((g) => `${g.year}_${g.gameId}`).join(','), [games]);
  const requestId = useRef(0);

  useEffect(() => {
    if (games.length === 0) {
      setWeekTop([]);
      setByGameTop(new Map());
      return;
    }

    const thisRequest = ++requestId.current;
    setLoading(true);
    setError(null);

    loadWeekPbpData(games)
      .then(({ allPlays, byGame, errors }) => {
        if (thisRequest !== requestId.current) return;

        setWeekTop(getTopPlays(allPlays, limit));

        const perGame = new Map<string, TaggedPlay[]>();
        byGame.forEach((plays, gameId) => perGame.set(gameId, getTopPlays(plays, limit)));
        setByGameTop(perGame);

        if (errors.length > 0) {
          console.warn('Some games failed to load for the weekly leaderboard:', errors);
          setError(
            errors.length === games.length
              ? 'Play-by-play data is not available for this week yet.'
              : `${errors.length} of ${games.length} games could not be loaded.`
          );
        }
      })
      .catch((err) => {
        if (thisRequest !== requestId.current) return;
        console.error(err);
        setError("Failed to load this week's play-by-play data.");
      })
      .finally(() => {
        if (thisRequest === requestId.current) setLoading(false);
      });
  }, [gamesKey, limit]);

  return { loading, error, weekTop, byGameTop };
}

interface TopPlaysListProps {
  plays: TaggedPlay[];
  showMatchup?: boolean;
  emptyMessage?: string;
  linkToGameModal?: boolean;
}

export function TopPlaysList({
  plays,
  showMatchup = false,
  emptyMessage = 'No notable plays yet.',
  linkToGameModal = true,
}: TopPlaysListProps) {
  if (plays.length === 0) {
    return <div style={emptyStyle}>{emptyMessage}</div>;
  }

  const openGameModal = (play: TaggedPlay) => {
    if (!linkToGameModal) return;
    window.dispatchEvent(
      new CustomEvent('open-pbp-modal', {
        detail: {
          gameId: play.gameId,
          year: play.year,
          homeTeam: play.home,
          awayTeam: play.away,
        },
      })
    );
  };

  return (
    <ol style={listStyle}>
      {plays.map((play, index) => {
        const impact = getPlayImpact(play);
        return (
          <li
            key={play.id}
            style={{ ...itemStyle, cursor: linkToGameModal ? 'pointer' : 'default' }}
            onClick={() => openGameModal(play)}
          >
            <span style={rankStyle}>{index + 1}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              {showMatchup && (
                <div style={matchupStyle}>
                  {play.away} @ {play.home} · Play #{play.playNumber}
                </div>
              )}
              <div style={playTextStyle}>{play.playText}</div>
            </div>
            {impact && (
              <span
                style={{
                  ...impactBadgeStyle,
                  color: impact.role === 'offense' ? '#34d399' : '#93c5fd',
                }}
              >
                {impact.icon} {impact.team} {formatEpa(impact.value)}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

interface WeeklyTopPlaysPanelProps {
  games: GameMeta[];
  limit?: number;
}

export function WeeklyTopPlaysPanel({ games, limit = 10 }: WeeklyTopPlaysPanelProps) {
  const { loading, error, weekTop } = usePbpWeekTopPlays(games, limit);

  return (
    <div style={panelStyle}>
      <h3 style={panelTitleStyle}>Top {limit} Plays This Week</h3>
      {loading && <div style={emptyStyle}>Loading this week's plays…</div>}
      {!loading && error && <div style={emptyStyle}>{error}</div>}
      {!loading && <TopPlaysList plays={weekTop} showMatchup />}
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  backgroundColor: '#111827',
  border: '1px solid #1f2937',
  borderRadius: '0.5rem',
  padding: '1rem',
};

const panelTitleStyle: React.CSSProperties = {
  color: '#f3f4f6',
  fontSize: '1rem',
  fontWeight: 700,
  margin: '0 0 0.75rem 0',
};

const listStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
};

const itemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.75rem',
  backgroundColor: '#1f2937',
  border: '1px solid #374151',
  borderRadius: '0.375rem',
  padding: '0.5rem 0.75rem',
};

const rankStyle: React.CSSProperties = {
  flexShrink: 0,
  width: '1.5rem',
  height: '1.5rem',
  borderRadius: '9999px',
  backgroundColor: '#374151',
  color: '#9ca3af',
  fontSize: '0.75rem',
  fontWeight: 700,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const matchupStyle: React.CSSProperties = {
  color: '#6b7280',
  fontSize: '0.7rem',
  marginBottom: '0.125rem',
};

const playTextStyle: React.CSSProperties = {
  color: '#e5e7eb',
  fontSize: '0.8125rem',
  lineHeight: '1.2rem',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
};

const impactBadgeStyle: React.CSSProperties = {
  flexShrink: 0,
  fontSize: '0.75rem',
  fontWeight: 700,
  whiteSpace: 'nowrap',
};

const emptyStyle: React.CSSProperties = {
  color: '#6b7280',
  fontSize: '0.875rem',
  textAlign: 'center',
  padding: '1rem 0',
};