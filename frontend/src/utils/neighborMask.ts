// Builds the "everything that is NOT Bangladesh" polygon used to tint the
// neighbouring countries (India / Myanmar / Bay of Bengal) a faint blue, so the
// real country pops on the Lighthouse map.
//
// Trick: a single GeoJSON Polygon whose OUTER ring is a big regional box and
// whose HOLES are every Bangladesh land ring. Filling that box with translucent
// blue leaves Bangladesh untinted (full satellite) while everything around it
// reads water-ish.

type Ring = number[][];

interface GeoFeature {
  geometry: { type: string; coordinates: unknown };
}
interface GeoCollection {
  features: GeoFeature[];
}

// A generous box around Bangladesh — covers eastern India, Nepal/Bhutan edges,
// Myanmar and the Bay of Bengal. [lng, lat] order, wound clockwise.
const REGION_RING: Ring = [
  [78, 12],
  [78, 32],
  [100, 32],
  [100, 12],
  [78, 12],
];

/** Collect the outer ring of every polygon in a (Multi)Polygon Bangladesh feature. */
function bangladeshRings(features: GeoFeature[]): Ring[] {
  const rings: Ring[] = [];
  for (const f of features) {
    const g = f.geometry;
    if (g.type === 'Polygon') {
      const coords = g.coordinates as Ring[];
      if (coords[0]?.length >= 4) rings.push(coords[0]);
    } else if (g.type === 'MultiPolygon') {
      const coords = g.coordinates as Ring[][];
      for (const poly of coords) {
        if (poly[0]?.length >= 4) rings.push(poly[0]);
      }
    }
  }
  return rings;
}

/**
 * Returns a GeoJSON Feature<Polygon> = regional box with Bangladesh punched out.
 * Use as the data of a `fill` layer tinted translucent blue.
 */
export function buildNeighborMask(adm0: GeoCollection): GeoJSON.Feature<GeoJSON.Polygon> {
  const holes = bangladeshRings(adm0.features);
  return {
    type: 'Feature',
    properties: { name: 'neighbors' },
    geometry: {
      type: 'Polygon',
      // first ring = outer (the region); the rest = holes (Bangladesh land)
      coordinates: [REGION_RING, ...holes],
    },
  };
}
