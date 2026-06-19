import { useEffect, useState } from 'react';
import { api } from '../services/api';
import type { SupplyData } from '../types';

export default function SupplyModule() {
  const [data, setData] = useState<SupplyData | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.supply('Bangladesh', null).then(setData).catch((e) => setErr(String(e)));
  }, []);

  if (err) return <div className="module-pad"><h1>Supply chain</h1><div className="toast error" style={{ position: 'static' }}>Backend unavailable — {err}</div></div>;
  if (!data) return <div className="module-pad"><h1>Supply chain</h1><p className="mod-loading">Optimising allocation…</p></div>;

  const e = data.efficiency;
  const gain = Math.round(e.optimized - e.naive);
  const maxDemand = Math.max(...data.districts.map((d) => d.demand), 1);

  return (
    <div className="module-pad supply">
      <header className="mod-head">
        <div>
          <h1>📦 Supply chain optimiser</h1>
          <p>Route limited relief around flood-cut corridors to the most at-risk districts — Bangladesh.</p>
        </div>
      </header>

      {/* Efficiency hero */}
      <div className="eff-hero">
        <div className="eff-main">
          <div className="eff-big">{e.optimized}%</div>
          <div className="eff-sub">of need delivered with <b>optimised routing</b></div>
        </div>
        <div className="eff-compare">
          <div className="eff-row">
            <span>Even split (naive)</span>
            <div className="eff-bar"><i style={{ width: `${e.naive}%` }} className="naive" /></div>
            <b>{e.naive}%</b>
          </div>
          <div className="eff-row">
            <span>BEACON optimised</span>
            <div className="eff-bar"><i style={{ width: `${e.optimized}%` }} className="opt" /></div>
            <b>{e.optimized}%</b>
          </div>
          <div className="eff-gain">+{gain} pts more aid delivered · {e.unmet.toLocaleString()} kits still unmet</div>
        </div>
      </div>

      {/* Inventory */}
      <div className="supply-items">
        {data.items.map((it) => (
          <div key={it.id} className="sup-item">
            <b>{it.stock.toLocaleString()}</b>
            <span>{it.name}</span>
          </div>
        ))}
      </div>

      <div className="supply-cols">
        {/* District allocation */}
        <section className="sup-card">
          <h3>District allocation (priority order)</h3>
          <table className="sup-table">
            <thead><tr><th>District</th><th>Need</th><th>Coverage</th></tr></thead>
            <tbody>
              {data.districts.map((d) => (
                <tr key={d.district}>
                  <td>{d.district}</td>
                  <td>{d.demand.toLocaleString()}</td>
                  <td>
                    <div className="cov-cell">
                      <div className="cov-track"><i style={{ width: `${d.coverage_pct}%` }} className={d.coverage_pct >= 100 ? 'full' : d.coverage_pct > 0 ? 'part' : 'none'} /></div>
                      <span>{d.coverage_pct}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="sup-note">Demand bar scaled to worst district ({maxDemand.toLocaleString()} kits).</p>
        </section>

        {/* Routes */}
        <section className="sup-card">
          <h3>Corridors from {data.routes[0]?.depot ?? 'depot'}</h3>
          <div className="route-list">
            {data.routes.map((r) => (
              <div key={r.district} className={`route ${r.status}`}>
                <span className="route-dist">{r.district}</span>
                <span className="route-meta">{r.distance_km} km · {r.eta_h} h</span>
                <span className={`pill ${r.status === 'cut' ? 'review' : 'auto'}`}>{r.status === 'cut' ? '✕ cut by flood' : '✓ open'}</span>
              </div>
            ))}
          </div>
          <p className="sup-note">Cut corridors are flagged for airlift instead of wasting a convoy.</p>
        </section>
      </div>
    </div>
  );
}
