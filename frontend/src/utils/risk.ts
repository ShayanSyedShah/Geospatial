// Shared risk -> color/label mapping (matches the Legend and the PDF brief).
export type RGBA = [number, number, number, number];

export function riskColor(risk: number): RGBA {
  if (risk > 0.8) return [211, 47, 47, 200]; // very high - red
  if (risk > 0.6) return [255, 152, 0, 195]; // high - orange
  if (risk > 0.4) return [255, 213, 79, 190]; // moderate - amber
  return [76, 175, 80, 170]; // low - green
}

export function riskLabel(risk: number): string {
  if (risk > 0.8) return 'Very High';
  if (risk > 0.6) return 'High';
  if (risk > 0.4) return 'Moderate';
  return 'Low';
}

export const RISK_LEGEND = [
  { color: '#d32f2f', label: 'Very High (>80%)' },
  { color: '#ff9800', label: 'High (60-80%)' },
  { color: '#ffd54f', label: 'Moderate (40-60%)' },
  { color: '#4caf50', label: 'Low (<40%)' },
];
