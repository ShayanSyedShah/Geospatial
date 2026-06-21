export interface FloodOverlaySettings {
  showRiverExtent: boolean;
  showFloodCells: boolean;
  showPopulation: boolean;
  showHumanTerrain: boolean;
}

interface Props {
  settings: FloodOverlaySettings;
  floodedCount: number;
  onChange: (s: FloodOverlaySettings) => void;
}

export default function FloodOverlayControls({ settings, floodedCount, onChange }: Props) {
  const toggle = (key: keyof FloodOverlaySettings) => {
    onChange({ ...settings, [key]: !settings[key] });
  };

  return (
    <div className="overlay-controls">
      <div className="overlay-controls-title">Bangladesh layers</div>
      <label className="overlay-toggle">
        <input
          type="checkbox"
          checked={settings.showHumanTerrain}
          onChange={() => toggle('showHumanTerrain')}
        />
        <span>Human terrain</span>
        <em>hides on zoom-in</em>
      </label>
      <label className="overlay-toggle">
        <input
          type="checkbox"
          checked={settings.showFloodCells}
          onChange={() => toggle('showFloodCells')}
        />
        <span>Risk grid</span>
        <em>{floodedCount} cells</em>
      </label>
      <label className="overlay-toggle">
        <input
          type="checkbox"
          checked={settings.showRiverExtent}
          onChange={() => toggle('showRiverExtent')}
        />
        <span>Flood extent</span>
      </label>
      <label className="overlay-toggle">
        <input
          type="checkbox"
          checked={settings.showPopulation}
          onChange={() => toggle('showPopulation')}
        />
        <span>Population density</span>
        <em>NASA SEDAC</em>
      </label>
      <p className="overlay-hint">Flood extent is the broad scenario layer. Risk grid cells are optional analysis units.</p>
    </div>
  );
}
