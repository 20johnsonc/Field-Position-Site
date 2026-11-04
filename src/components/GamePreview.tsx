import React, { useState, useEffect, useMemo } from 'react';

// Approximation of the Normal CDF (matches scipy.stats.norm.cdf)
function normalCdf(x: number) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

interface Team {
  team: string;
  rank: number;
  conference: string;
  wins: number;
  losses: number;
  adj_off: number;
  adj_def: number;
  adj_net: number;
  tempo: number;
  team_bpr_raw: number;
  rot_level: number;
  direct_net: number;
  efg: number;
  tov_rate: number;
  orb_pct: number;
  ftr: number;
}

interface ModelWeights {
  features: string[];
  betas: number[];
  sigma: number;
}

interface RankingsDoc {
  model: ModelWeights;
  bpr_meta?: { intercept: number };
  teams: Team[];
}

const num = (val: any, fallback: number) => {
  const n = Number(val);
  return isNaN(n) ? fallback : n;
};

const fmt = (val: any, d = 1) => {
  const n = Number(val);
  return isNaN(n) ? '—' : n.toFixed(d);
};

const EARLY_DAYS = 40; 

const RankBadge = ({ rank }: { rank: number | null }) => {
  if (!rank) return null;
  const isTop10 = rank <= 10;
  const isTop25 = rank <= 25;
  let color = 'var(--text-muted)';
  let bg = 'var(--surface-3)';
  if (isTop10) { color = '#d97706'; bg = 'rgba(217, 119, 6, 0.15)'; }
  else if (isTop25) { color = '#64748b'; bg = 'rgba(100, 116, 139, 0.15)'; }
  else if (rank <= 50) { color = '#b45309'; bg = 'rgba(180, 83, 9, 0.15)'; }

  return (
    <span style={{ 
      fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', fontWeight: 800, 
      color, background: bg, fontVariantNumeric: 'tabular-nums', 
      boxShadow: isTop10 ? '0 0 8px rgba(217, 119, 6, 0.4)' : 'none'
    }}>
      #{rank}
    </span>
  );
};

export default function GamePreview({ year }: { year: number }) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [model, setModel] = useState<ModelWeights | null>(null);
  const [effMu, setEffMu] = useState<number>(100.0);
  const [homeTeam, setHomeTeam] = useState<string>('');
  const [awayTeam, setAwayTeam] = useState<string>('');
  const [isNeutralSite, setIsNeutralSite] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/data/basketball/${year}/rankings.json`);
        const data: RankingsDoc = await res.json();
        
        const sorted = (data.teams || []).sort((a: Team, b: Team) => a.team.localeCompare(b.team));
        setTeams(sorted);
        setModel(data.model || null);
        setEffMu(data.bpr_meta?.intercept ?? 100.0);
        
        if (sorted.length > 1) {
          setHomeTeam(sorted[0].team);
          setAwayTeam(sorted[1].team);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [year]);

  const ranks = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    if (!teams.length) return map;

    const calcRank = (key: keyof Team, higherIsBetter: boolean) => {
      const sorted = [...teams].sort((a, b) => {
        const valA = num(a[key], higherIsBetter ? -999 : 999);
        const valB = num(b[key], higherIsBetter ? -999 : 999);
        return higherIsBetter ? valB - valA : valA - valB;
      });
      sorted.forEach((t, i) => { 
        if (!map[t.team]) map[t.team] = {};
        map[t.team][key as string] = i + 1; 
      });
    };

    calcRank('adj_off', true);
    calcRank('adj_def', false);
    calcRank('team_bpr_raw', true);
    calcRank('direct_net', true);
    calcRank('tempo', true);
    calcRank('efg', true);
    calcRank('tov_rate', false);
    calcRank('orb_pct', true);
    calcRank('ftr', true);

    return map;
  }, [teams]);

  const prediction = useMemo(() => {
    if (!model || !homeTeam || !awayTeam) return null;
    const home = teams.find(t => t.team === homeTeam);
    const away = teams.find(t => t.team === awayTeam);
    if (!home || !away) return null;

    const h_tempo = num(home.tempo, 68.0);
    const a_tempo = num(away.tempo, 68.0);
    const h_off = num(home.adj_off, 100.0);
    const h_def = num(home.adj_def, 100.0);
    const a_off = num(away.adj_off, 100.0);
    const a_def = num(away.adj_def, 100.0);
    
    const exp_poss = (h_tempo + a_tempo) / 2.0;
    const net_h = num(home.team_bpr_raw, 0.0);
    const net_a = num(away.team_bpr_raw, 0.0);
    const net_x_tempo = (net_h - net_a) * exp_poss / 100.0;

    const rl_h = num(home.rot_level, 0.0);
    const rl_a = num(away.rot_level, 0.0);
    const rot_level = (rl_h - rl_a) * exp_poss / 100.0;

    const dh = num(home.direct_net, 0.0);
    const da = num(away.direct_net, 0.0);
    const direct_net_diff = (dh - da) * exp_poss / 100.0;

    const anchor = new Date(year - 1, 10, 1).getTime();
    const day = Math.max(0, (Date.now() - anchor) / (1000 * 3600 * 24));
    const early_weight = Math.max(0, Math.min(1, 1 - day / EARLY_DAYS));
    
    const features: Record<string, number> = {
      hca: isNeutralSite ? 0.0 : 1.0,
      net_x_tempo: net_x_tempo,
      net_x_tempo_early: net_x_tempo * early_weight,
      rot_level: rot_level,
      direct_net_diff: direct_net_diff,
    };

    let pred_margin = 0;
    if (Array.isArray(model.features) && Array.isArray(model.betas)) {
      model.features.forEach((f, i) => {
        const beta = num(model.betas[i], 0);
        const val = num(features[f], 0);
        pred_margin += val * beta;
      });
    }

    const exp_eff_h = h_off + a_def - effMu;
    const exp_eff_a = a_off + h_def - effMu;
    const pred_total = (exp_poss / 100.0) * (exp_eff_h + exp_eff_a);

    const home_score = (pred_total + pred_margin) / 2.0;
    const away_score = (pred_total - pred_margin) / 2.0;
    const win_prob = normalCdf(pred_margin / model.sigma) * 100;

    const safe_margin = isNaN(pred_margin) ? 0 : pred_margin;
    const safe_total = isNaN(pred_total) ? 140 : pred_total;
    const safe_home = isNaN(home_score) ? 70 : home_score;
    const safe_away = isNaN(away_score) ? 70 : away_score;
    const safe_win_prob = isNaN(win_prob) ? 50 : win_prob;

    const homeFavored = safe_margin > 0;

    const h_ppg = (h_off * h_tempo) / 100.0;
    const a_ppg = (a_off * a_tempo) / 100.0;
    const h_opp_ppg = (h_def * h_tempo) / 100.0;
    const a_opp_ppg = (a_def * a_tempo) / 100.0;

    return {
      home, 
      away,
      homeFavored,
      home_score: safe_home.toFixed(1),
      away_score: safe_away.toFixed(1),
      margin: Math.abs(safe_margin).toFixed(1),
      total: safe_total.toFixed(1),
      win_prob: (homeFavored ? safe_win_prob : 100 - safe_win_prob).toFixed(1),
      pace: exp_poss.toFixed(1),
      h_ppg: h_ppg.toFixed(1),
      a_ppg: a_ppg.toFixed(1),
      h_opp_ppg: h_opp_ppg.toFixed(1),
      a_opp_ppg: a_opp_ppg.toFixed(1)
    };
  }, [teams, model, effMu, homeTeam, awayTeam, isNeutralSite]);

  if (loading) return <div style={{ padding: '24px', color: 'var(--text-muted)' }}>Loading model...</div>;
  if (!model) return <div style={{ padding: '24px', color: 'var(--accent-danger)' }}>Model weights not found in JSON. Did you re-run the export?</div>;
  if (!prediction) return <div style={{ padding: '24px', color: 'var(--text-muted)' }}>Select two teams.</div>;

  const { home, away, homeFavored } = prediction;

  // Tug-of-War Bar Row
  const StatRow = ({ 
    label, 
    hVal, 
    aVal, 
    hRank, 
    aRank, 
    higherIsBetter = true, 
    isPct = false 
  }: { 
    label: string, 
    hVal: string, 
    aVal: string, 
    hRank?: number, 
    aRank?: number, 
    higherIsBetter?: boolean, 
    isPct?: boolean 
  }) => {
    const nH = parseFloat(hVal);
    const nA = parseFloat(aVal);
    const hBetter = higherIsBetter ? nH >= nA : nH <= nA;
    const aBetter = higherIsBetter ? nA >= nH : nA <= nH;
    
    const total = Math.abs(nH) + Math.abs(nA) || 1;
    let hPct = (nH / total) * 100;
    if (!higherIsBetter) hPct = 100 - hPct;
    hPct = Math.max(10, Math.min(90, hPct));

    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '16px', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--card-border)' }}>
        <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
          <span style={{ fontSize: '1rem', fontWeight: hBetter ? 800 : 500, color: hBetter ? 'var(--text)' : 'var(--text-muted)' }}>
            {hVal}{isPct ? '%' : ''}
          </span>
          {hRank && <RankBadge rank={hRank} />}
        </div>

        <div style={{ textAlign: 'center', minWidth: '120px' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
            {label}
          </div>
          <div style={{ display: 'flex', height: '6px', borderRadius: '3px', overflow: 'hidden', background: 'var(--surface-3)' }}>
            <div style={{ width: `${hPct}%`, background: hBetter ? 'var(--accent-primary)' : 'var(--surface-3)', opacity: hBetter ? 1 : 0.5, transition: 'all 0.3s ease' }}></div>
            <div style={{ flex: 1, background: aBetter ? 'var(--accent-info)' : 'var(--surface-3)', opacity: aBetter ? 1 : 0.5, transition: 'all 0.3s ease' }}></div>
          </div>
        </div>

        <div style={{ textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '8px' }}>
          {aRank && <RankBadge rank={aRank} />}
          <span style={{ fontSize: '1rem', fontWeight: aBetter ? 800 : 500, color: aBetter ? 'var(--text)' : 'var(--text-muted)' }}>
            {aVal}{isPct ? '%' : ''}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      
      {/* 1. Compact Selectors */}
      <div className="card" style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1 }}>
          <select value={homeTeam} onChange={(e) => setHomeTeam(e.target.value)} style={{ flex: 1, padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--card-border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: '0.95rem', fontWeight: 600 }}>
            {teams.map(t => <option key={t.team} value={t.team}>{t.team}</option>)}
          </select>
          
          <button 
            onClick={() => { const temp = homeTeam; setHomeTeam(awayTeam); setAwayTeam(temp); }}
            style={{ background: 'var(--surface-3)', border: '1px solid var(--card-border)', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text)', flexShrink: 0 }}
            title="Swap Home/Away"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/></svg>
          </button>

          <select value={awayTeam} onChange={(e) => setAwayTeam(e.target.value)} style={{ flex: 1, padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--card-border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: '0.95rem', fontWeight: 600 }}>
            {teams.map(t => <option key={t.team} value={t.team}>{t.team}</option>)}
          </select>
        </div>

        <button 
          onClick={() => setIsNeutralSite(!isNeutralSite)}
          style={{
            padding: '8px 16px', borderRadius: '20px', border: '1px solid var(--card-border)',
            background: isNeutralSite ? 'var(--accent-secondary)' : 'var(--surface-2)',
            color: isNeutralSite ? '#fff' : 'var(--text)',
            cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', whiteSpace: 'nowrap'
          }}
        >
          {isNeutralSite ? 'Neutral Site: ON' : 'Neutral Site: OFF'}
        </button>
      </div>

      {/* 2. Condensed Scoreboard */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '24px 32px', background: 'var(--surface-2)' }}>
          
          {/* Home Team */}
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '4px' }}>
              <span style={{ fontSize: '1.1rem', fontWeight: 800 }}>{home.team}</span>
              <RankBadge rank={home.rank} />
            </div>
            <div style={{ fontSize: '2.5rem', fontWeight: 900, color: homeFavored ? 'var(--accent-primary)' : 'var(--text)', lineHeight: 1 }}>
              {prediction.home_score}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>{home.conference} · {home.wins}-{home.losses}</div>
          </div>

          {/* Center Info */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 24px' }}>
            <div style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--text-muted)', opacity: 0.3, marginBottom: '8px' }}>VS</div>
            <div style={{ background: 'var(--surface-3)', padding: '6px 12px', borderRadius: '16px', fontSize: '0.75rem', fontWeight: 800, whiteSpace: 'nowrap', marginBottom: '12px' }}>
              O/U {prediction.total}
            </div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Pace {prediction.pace}
            </div>
          </div>

          {/* Away Team */}
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '4px' }}>
              <span style={{ fontSize: '1.1rem', fontWeight: 800 }}>{away.team}</span>
              <RankBadge rank={away.rank} />
            </div>
            <div style={{ fontSize: '2.5rem', fontWeight: 900, color: !homeFavored ? 'var(--accent-primary)' : 'var(--text)', lineHeight: 1 }}>
              {prediction.away_score}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>{away.conference} · {away.wins}-{away.losses}</div>
          </div>
        </div>
        
        {/* Win Probability Bar */}
        <div style={{ padding: '16px 32px', borderTop: '1px solid var(--card-border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '6px' }}>
            <span>{homeFavored ? `Favored by ${prediction.margin}` : ''}</span>
            <span>{!homeFavored ? `Favored by ${prediction.margin}` : ''}</span>
          </div>
          <div style={{ display: 'flex', height: '10px', borderRadius: '5px', overflow: 'hidden', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.1)' }}>
            <div style={{ width: `${prediction.win_prob}%`, background: homeFavored ? 'var(--accent-primary)' : 'var(--text-muted)', transition: 'width 0.3s ease' }}></div>
            <div style={{ flex: 1, background: !homeFavored ? 'var(--accent-primary)' : 'var(--text-muted)', transition: 'width 0.3s ease' }}></div>
          </div>
        </div>
      </div>

      {/* 3. Tale of the Tape */}
      <div className="card" style={{ padding: '20px 24px' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text)', marginTop: 0, marginBottom: '16px' }}>Tale of the Tape</h3>
        
        <StatRow label="Projected PPG" hVal={prediction.h_ppg} aVal={prediction.a_ppg} higherIsBetter={true} />
        <StatRow label="Projected OPP PPG" hVal={prediction.h_opp_ppg} aVal={prediction.a_opp_ppg} higherIsBetter={false} />
        <StatRow label="Adj. Offense" hVal={fmt(home.adj_off)} aVal={fmt(away.adj_off)} hRank={ranks[home.team]?.adj_off} aRank={ranks[away.team]?.adj_off} higherIsBetter={true} />
        <StatRow label="Adj. Defense" hVal={fmt(home.adj_def)} aVal={fmt(away.adj_def)} hRank={ranks[home.team]?.adj_def} aRank={ranks[away.team]?.adj_def} higherIsBetter={false} />
        <StatRow label="Team BPR" hVal={fmt(home.team_bpr_raw)} aVal={fmt(away.team_bpr_raw)} hRank={ranks[home.team]?.team_bpr_raw} aRank={ranks[away.team]?.team_bpr_raw} higherIsBetter={true} />
        
        <h4 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '24px', marginBottom: '8px' }}>
          Four Factors
        </h4>
        <StatRow label="Effective FG%" hVal={fmt(home.efg)} aVal={fmt(away.efg)} hRank={ranks[home.team]?.efg} aRank={ranks[away.team]?.efg} higherIsBetter={true} isPct={true} />
        <StatRow label="Turnover Rate" hVal={fmt(home.tov_rate)} aVal={fmt(away.tov_rate)} hRank={ranks[home.team]?.tov_rate} aRank={ranks[away.team]?.tov_rate} higherIsBetter={false} isPct={true} />
        <StatRow label="Off. Rebound %" hVal={fmt(home.orb_pct)} aVal={fmt(away.orb_pct)} hRank={ranks[home.team]?.orb_pct} aRank={ranks[away.team]?.orb_pct} higherIsBetter={true} isPct={true} />
        <StatRow label="Free Throw Rate" hVal={fmt(home.ftr)} aVal={fmt(away.ftr)} hRank={ranks[home.team]?.ftr} aRank={ranks[away.team]?.ftr} higherIsBetter={true} isPct={true} />
      </div>

    </div>
  );
}