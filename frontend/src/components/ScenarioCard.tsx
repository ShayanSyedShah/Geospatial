interface Props {
  onStart: () => void;
}

// The 5-second purpose: WHO uses this, to decide WHAT, under what TIME pressure.
export default function ScenarioCard({ onStart }: Props) {
  return (
    <div className="scenario-overlay">
      <div className="scenario-card">
        <div className="sc-eyebrow">UN Tech Over 2026 · Challenge 2 · anticipatory action</div>
        <h2>When the Jamuna crosses its danger line, who do we reach first?</h2>
        <p className="sc-lead">
          BEACON helps a <b>district disaster officer in Sirajganj</b> turn a flood forecast into a
          defensible, cited <b>“who to protect first”</b> list — in minutes, not days.
        </p>

        <div className="sc-story">
          <div className="sc-persona">
            <span className="sc-avatar">AR</span>
            <div>
              <b>Ayesha Rahman</b><span> · District Disaster Response Officer (illustrative)</span>
              <p>
                It’s the morning of <b>4 July 2024</b>. The FFWC 5-day forecast just crossed the danger
                level at Bahadurabad. CERF funds are releasing <i>now</i>. She has a fixed number of
                cash transfers, water units and hygiene kits — and <b>hours, not days</b>, to decide
                which parts of Sirajganj get them first.
              </p>
            </div>
          </div>
        </div>

        <div className="sc-facts">
          <div><b>16 min</b><span>from trigger to CERF release ($6.2M), July 2024</span></div>
          <div><b>~430,000</b><span>people reached in 5 days — before the peak</span></div>
          <div><b>5 districts</b><span>incl. Sirajganj — the real AA pilot</span></div>
        </div>

        <button className="sc-start" onClick={onStart}>Start — it’s the morning of 4 July 2024 →</button>
        <div className="sc-note">A screening / prioritisation tool — not the operational FFWC/GloFAS trigger system. Built on UN public data.</div>
      </div>
    </div>
  );
}
