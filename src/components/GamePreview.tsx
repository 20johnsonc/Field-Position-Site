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
  conference: string;
  adj_off: number;
  adj_def: number;
  adj_net: number;
  tempo: number;
  direct_net: number;
  rot_level: number;
}

interface ModelWeights {
  features: string[];
  betas: number[];
  sigma: number;
  eff_mu: number;
}

export default function GamePreview({ year }: { year: number }) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [model, setModel] = useState<ModelWeights | null>(null);
  const [homeTeam, setHomeTeam] = useState<string>('');
  const [awayTeam, setAwayTeam] = useState<string>('');
  const [isNeutralSite, setIsNeutralSite] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/data/basketball/${year}/rankings.json`);
        const data = await res.json();
        
        const sorted = data.teams.sort((a: Team, b: Team) => a.team.localeCompare(b.team));
        setTeams(sorted);
        setModel(data.model || null);
        
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

  const prediction = useMemo(() => {
    if (!model || !homeTeam || !awayTeam) return null;
    const home = teams.find(t => t.team === homeTeam);
    const away = teams.find(t => t.team === awayTeam);
    if (!home || !away) return null;

    // 1. Calculate Pace
    const exp_poss = (home.tempo + away.tempo) / 2.0;

    // 2. Build Features (matching Python's build_model_table)
    const net_h = home.adj_off - home.adj_def;
    const net_a = away.adj_off - away.adj_def;
    
    const features: Record<string, number> = {
      hca: isNeutralSite ? 0.0 : 1.0, // Home Court Advantage
      net_x_tempo: (net_h - net_a) * exp_poss / 100.0,
      net_x_tempo_early: 0.0,
      rot_level: (home.rot_level - away.rot_level) * exp_poss / 100.0,
      direct_net_diff: (home.direct_net - away.direct_net) * exp_poss / 100.0,
    };

    // 3. Calculate Margin (X * Beta)
    let pred_margin = 0;
    model.features.forEach((f, i) => {
      pred_margin += (features[f] || 0) * model.betas[i];
    });

    // 4. Calculate Total (Structural Total)
    const exp_eff_h = home.adj_off + away.adj_def - model.eff_mu;
    const exp_eff_a = away.adj_off + home.adj_def - model.eff_mu;
    const pred_total = (exp_poss / 100.0) * (exp_eff_h + exp_eff_a);

    // 5. Convert to Scores
    const home_score = (pred_total + pred_margin) / 2.0;
    const away_score = (pred_total - pred_margin) / 2.0;

    // 6. Win Probability
    const win_prob = normalCdf(pred_margin / model.sigma);

    return {
      home, away,
      home_score: home_score.toFixed(1),
      away_score: away_score.toFixed(1),
      margin: pred_margin.toFixed(1),
      total: pred_total.toFixed(1),
      win_prob: (win_prob * 100).toFixed(1),
      pace: exp_poss.toFixed(1)
    };
  }, [teams, model, homeTeam, awayTeam, isNeutralSite]);

  if (loading) return <div style={{ padding: '24px', color: 'var(--text-muted)' }}>Loading model...</div>;
  if (!model) return <div style={{ padding: '24px', color: 'var(--accent-danger)' }}>Model weights not found in JSON. Did you re-run the export?</div>;
  if (!prediction) return <div style={{ padding: '24px', color: 'var(--text-muted)' }}>Select two teams.</div>;

  const { home, away } = prediction;
  const homeFavored = Number(prediction.margin) > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* 1. Selectors (Clean Grid) */}
      <div className="card" style={{ padding: '24px' }}>
        
        {/* Toggle Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
          <h2 className="section-title" style={{ margin: 0 }}>Matchup Predictor</h2>
          <button 
            onClick={() => setIsNeutralSite(!isNeutralSite)}
            style={{
              padding: '8px 16px', borderRadius: '20px', border: '1px solid var(--card-border)',
              background: isNeutralSite ? 'var(--accent-secondary)' : 'var(--surface-2)',
              color: isNeutralSite ? '#fff' : 'var(--text)',
              cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', transition: 'all 0.2s ease'
            }}
          >
            {isNeutralSite ? 'Neutral Site: ON' : 'Neutral Site: OFF'}
          </button>
        </div>

        {/* Team Dropdowns */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '16px', alignItems: 'center' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase' }}>Home Team</label>
            <select value={homeTeam} onChange={(e) => setHomeTeam(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--card-border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: '1rem', fontWeight: 600 }}>
              {teams.map(t => <option key={t.team} value={t.team}>{t.team}</option>)}
            </select>
          </div>
          
          <button 
            onClick={() => { const temp = homeTeam; setHomeTeam(awayTeam); setAwayTeam(temp); }}
            style={{ 
              background: 'var(--surface-3)', border: '1px solid var(--card-border)', borderRadius: '50%', 
              width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', marginTop: '24px', color: 'var(--text)'
            }}
            title="Swap Home/Away"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/></svg>
          </button>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase' }}>Away Team</label>
            <select value={awayTeam} onChange={(e) => setAwayTeam(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--card-border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: '1rem', fontWeight: 600 }}>
              {teams.map(t => <option key={t.team} value={t.team}>{t.team}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* 2. Prediction Scoreboard (Horizontal) */}
      <div className="card" style={{ padding: '40px 24px', display: 'flex', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
        
        <div style={{ flex: 1, textAlign: 'right', minWidth: '150px' }}>
          <div style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '8px' }}>{home.team}</div>
          <div style={{ fontSize: '4rem', fontWeight: 900, color: homeFavored ? 'var(--accent-primary)' : 'var(--text)', lineHeight: 1 }}>{prediction.home_score}</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '8px' }}>{home.conference}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--text-muted)' }}>—</div>
          <div style={{ background: 'var(--surface-2)', padding: '6px 12px', borderRadius: '20px', border: '1px solid var(--card-border)', fontSize: '0.8rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
            O/U {prediction.total}
          </div>
        </div>

        <div style={{ flex: 1, textAlign: 'left', minWidth: '150px' }}>
          <div style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '8px' }}>{away.team}</div>
          <div style={{ fontSize: '4rem', fontWeight: 900, color: !homeFavored ? 'var(--accent-primary)' : 'var(--text)', lineHeight: 1 }}>{prediction.away_score}</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '8px' }}>{away.conference}</div>
        </div>
      </div>

      {/* 3. Prediction Details */}
      <div className="card" style={{ padding: '20px', textAlign: 'center' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '16px' }}>
          {homeFavored ? home.team : away.team} is favored by {Math.abs(Number(prediction.margin)).toFixed(1)} points
        </h3>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '40px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Win Prob</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--accent-primary)' }}>
              {homeFavored ? `${prediction.win_prob}%` : `${(100 - Number(prediction.win_prob)).toFixed(1)}%`}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Proj. Pace</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--text)' }}>{prediction.pace}</div>
          </div>
        </div>
      </div>

      {/* 4. Side by Side Features */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        <div className="card" style={{ padding: '20px' }}>
          <h3 className="section-title" style={{ marginTop: 0, marginBottom: '16px', fontSize: '1.1rem' }}>{home.team} Profile</h3>
          <div className="analytics-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="stat-box"><span className="stat-label">Adj Off</span><span className="stat-comparison"><strong>{home.adj_off.toFixed(1)}</strong></span></div>
            <div className="stat-box"><span className="stat-label">Adj Def</span><span className="stat-comparison"><strong>{home.adj_def.toFixed(1)}</strong></span></div>
            <div className="stat-box"><span className="stat-label">Direct Net</span><span className="stat-comparison"><strong>{home.direct_net.toFixed(1)}</strong></span></div>
            <div className="stat-box"><span className="stat-label">Rot Level</span><span className="stat-comparison"><strong>{home.rot_level.toFixed(1)}</strong></span></div>
          </div>
        </div>

        <div className="card" style={{ padding: '20px' }}>
          <h3 className="section-title" style={{ marginTop: 0, marginBottom: '16px', fontSize: '1.1rem' }}>{away.team} Profile</h3>
          <div className="analytics-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="stat-box"><span className="stat-label">Adj Off</span><span className="stat-comparison"><strong>{away.adj_off.toFixed(1)}</strong></span></div>
            <div className="stat-box"><span className="stat-label">Adj Def</span><span className="stat-comparison"><strong>{away.adj_def.toFixed(1)}</strong></span></div>
            <div className="stat-box"><span className="stat-label">Direct Net</span><span className="stat-comparison"><strong>{away.direct_net.toFixed(1)}</strong></span></div>
            <div className="stat-box"><span className="stat-label">Rot Level</span><span className="stat-comparison"><strong>{away.rot_level.toFixed(1)}</strong></span></div>
          </div>
        </div>
      </div>
    </div>
  );
}