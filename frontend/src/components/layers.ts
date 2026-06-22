import type { FloodOverlaySettings } from './FloodOverlayControls';

// A stackable map layer the user can toggle, fade, and reorder.
export type LayerId = 'spikes' | 'poverty' | 'riskGrid' | 'floodExtent' | 'clinics' | 'schools' | 'nasaPop';

export interface LayerCfg {
  id: LayerId;
  label: string;
  sub?: string;
  on: boolean;
  opacity: number; // 0..1
}

// Order = stacking order, index 0 = top of the stack (drawn over the rest).
export const DEFAULT_LAYERS: LayerCfg[] = [
  { id: 'spikes', label: 'Population spikes', sub: '3D · WorldPop', on: true, opacity: 1 },
  { id: 'poverty', label: 'Poverty (wealth)', sub: 'green→red · Meta RWI', on: false, opacity: 0.92 },
  { id: 'riskGrid', label: 'Risk grid', sub: 'flood cells', on: false, opacity: 0.9 },
  { id: 'floodExtent', label: 'Flood extent', sub: 'GloFAS', on: false, opacity: 0.85 },
  { id: 'clinics', label: 'Clinics & hospitals', sub: 'all · Healthsites', on: false, opacity: 1 },
  { id: 'schools', label: 'Schools', sub: 'all · Giga/OSM', on: false, opacity: 1 },
  { id: 'nasaPop', label: 'NASA population', sub: 'SEDAC raster (base)', on: false, opacity: 0.55 },
];

export const opacityOf = (layers: LayerCfg[], id: LayerId): number =>
  layers.find((l) => l.id === id)?.opacity ?? 1;

export const isOn = (layers: LayerCfg[], id: LayerId): boolean =>
  layers.find((l) => l.id === id)?.on ?? false;

// Stacking rank: lower = higher in the panel = drawn on top. Used to sort deck layers.
export const rankOf = (layers: LayerCfg[], id: LayerId): number => {
  const i = layers.findIndex((l) => l.id === id);
  return i === -1 ? 99 : i;
};

// Bridge to the existing boolean-based overlay gating used throughout Globe.
export function deriveOverlay(layers: LayerCfg[]): FloodOverlaySettings {
  return {
    showRiverExtent: isOn(layers, 'floodExtent'),
    showFloodCells: isOn(layers, 'riskGrid'),
    showPopulation: isOn(layers, 'nasaPop'),
    showHumanTerrain: isOn(layers, 'spikes'),
    showPoverty: isOn(layers, 'poverty'),
    showClinics: isOn(layers, 'clinics'),
    showSchools: isOn(layers, 'schools'),
  };
}
