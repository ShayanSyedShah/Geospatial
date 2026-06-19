export interface FloodOverlaySettings {
  showRiverExtent: boolean;
  showFloodCells: boolean;
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
      <div className="overlay-controls-title">Flood layers</div>
      <label className="overlay-toggle">
        <input
          type="checkbox"
          checked={settings.showFloodCells}
          onChange={() => toggle('showFloodCells')}
        />
        <span>Flood zones</span>
        <em>{floodedCount} cells</em>
      </label>
      <label className="overlay-toggle">
        <input
          type="checkbox"
          checked={settings.showRiverExtent}
          onChange={() => toggle('showRiverExtent')}
        />
        <span>River extent tint</span>
      </label>
      <p className="overlay-hint">Click a coloured cell for flood evidence</p>
    </div>
  );
}
