// Real water for the Sylhet 2022 river-surge scene.
//
// Same engine as the standalone Water Lab (waterlab.html): a shallow-water flow
// simulation (virtual pipes) on the real SRTM terrain, rendered with a custom
// depth-graded, translucent, rippling water shader. Water rises out of the real
// river network (Barak -> Surma/Kushiyara/Kalni + feeders, from
// affected_rivers.geojson) and SPREADS downhill to fill the low river valleys
// and haor floodplain — wide and natural, exactly like the Water Lab's Jamuna.
// No terrain slab is drawn and dry cells are discarded, so all you see is water
// pooling in the real low ground over MapLibre's satellite map.
import * as THREE from 'three';
import maplibregl from 'maplibre-gl';
import DEM from './sylhet_dem.json';
import RIVERS from './sylhet_rivers.json';

type Grid = { nx: number; ny: number; bbox: number[]; elev: number[][] };
type RiverData = { bbox: number[]; rivers: number[][][] };

const EXAG = 9; // gentle vertical exaggeration; water basically hugs the map

export class SylhetMapWaterLayer implements maplibregl.CustomLayerInterface {
  id = 'sylhet-real-water';
  type = 'custom' as const;
  renderingMode = '3d' as const;

  private map!: maplibregl.Map;
  private renderer!: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.Camera();
  private waterGeo!: THREE.BufferGeometry;
  private waterMat!: THREE.ShaderMaterial;

  private NX: number; private NY: number; private N: number;
  private b: Float32Array;
  private d: Float32Array;
  private fL: Float32Array; private fR: Float32Array; private fT: Float32Array; private fB: Float32Array;
  private src: number[] = [];

  private basinFloor = 0;
  private readonly cellM = 360; private readonly g = 9.81; private readonly dt = 0.05; private readonly speed = 4.2;
  private readonly maxStageM = 3.5;   // river depth at full surge (colour, not spread)
  private readonly maxFloodStageM = 5.5; // how high the basin fills (above floor)
  private targetStage = 0;
  private stage = 0;
  private mode: 'off' | 'surge' | 'flood' = 'off';
  private lastFloodFc: unknown = null;           // skip re-rasterising the same extent
  private riverMask!: Float32Array;              // narrow river-width mask (surge stays river-sized)

  private origin: maplibregl.MercatorCoordinate;
  private scaleM: number;
  private local = new THREE.Matrix4();
  private readonly minVisibleZoom = 6.5;

  constructor() {
    const grid = DEM as Grid;
    this.NX = grid.nx; this.NY = grid.ny; this.N = grid.nx * grid.ny;
    this.b = new Float32Array(this.N);
    for (let j = 0; j < this.NY; j++) for (let i = 0; i < this.NX; i++) {
      this.b[j * this.NX + i] = Math.max(1, Math.min(45, grid.elev[j][i]));
    }
    this.smooth(2);
    const sorted = Array.from(this.b).sort((a, c) => a - c);
    this.basinFloor = sorted[Math.floor(0.10 * (this.N - 1))]; // ~10th pct = valley floor

    // Rasterise the real river network into source cells. The sim spreads water
    // outward from here into the low ground.
    const [lng0, lat0, lng1, lat1] = grid.bbox;
    const toGrid = (lng: number, lat: number) => ({
      i: (lng - lng0) / (lng1 - lng0) * (this.NX - 1),
      j: (lat - lat0) / (lat1 - lat0) * (this.NY - 1),
    });
    // riverMask = narrow river-width footprint (centre strong, edge weak) so the
    // surge stays the SIZE OF A RIVER and never spreads over houses.
    const rMask = new Float32Array(this.N);
    const seen = new Set<number>();
    const mark = (ci: number, cj: number) => {
      const i0 = Math.round(ci), j0 = Math.round(cj);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = i0 + di, jj = j0 + dj;
        if (ii < 0 || ii >= this.NX || jj < 0 || jj >= this.NY) continue;
        const k = jj * this.NX + ii;
        const w = (di === 0 && dj === 0) ? 1 : (di === 0 || dj === 0) ? 0.5 : 0.28;
        if (w > rMask[k]) rMask[k] = w;
        if (!seen.has(k)) { seen.add(k); this.src.push(k); }
      }
    };
    for (const line of (RIVERS as RiverData).rivers) {
      for (let p = 0; p < line.length - 1; p++) {
        const a = toGrid(line[p][0], line[p][1]);
        const c = toGrid(line[p + 1][0], line[p + 1][1]);
        const steps = Math.max(1, Math.ceil(Math.hypot(c.i - a.i, c.j - a.j) * 2));
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          mark(a.i + (c.i - a.i) * t, a.j + (c.j - a.j) * t);
        }
      }
    }
    this.riverMask = rMask;

    this.d = new Float32Array(this.N);
    this.fL = new Float32Array(this.N); this.fR = new Float32Array(this.N);
    this.fT = new Float32Array(this.N); this.fB = new Float32Array(this.N);

    const cLng = (lng0 + lng1) / 2, cLat = (lat0 + lat1) / 2;
    this.origin = maplibregl.MercatorCoordinate.fromLngLat([cLng, cLat], 0);
    this.scaleM = this.origin.meterInMercatorCoordinateUnits();
  }

  /** Step 4 — rivers swell + spread (shallow-water sim). Re-entering restarts the
   *  grow from empty so you watch the water rise out of the rivers and fill the
   *  haor basin over several seconds. */
  setSurge(frac: number) {
    if (frac > 0.001) {
      if (this.mode !== 'surge') this.reset(); // start the grow fresh
      this.mode = 'surge';
    }
    this.targetStage = Math.max(0, Math.min(1, frac)) * this.maxStageM;
    if (frac <= 0.001) this.reset();
  }
  /** Step 5 — river water overtops and FILLS the low haor basin (shallow-water
   *  sim spreading from the rivers; depth follows the real terrain — deep in the
   *  low haor, shallow at the rim). Re-entering restarts the fill from empty. */
  setFlood(frac: number) {
    if (frac > 0.001) {
      if (this.mode !== 'flood') this.reset(); // fill fresh from empty
      this.mode = 'flood';
    }
    this.targetStage = Math.max(0, Math.min(1, frac)) * this.maxFloodStageM;
    if (frac <= 0.001) this.reset();
  }
  /** Back-compat alias (old callers used setLevel for the surge). */
  setLevel(frac: number) { this.setSurge(frac); }

  private reset() {
    this.stage = 0; this.mode = 'off';
    this.d.fill(0); this.fL.fill(0); this.fR.fill(0); this.fT.fill(0); this.fB.fill(0);
  }

  /** Rasterise an observed flood-extent polygon into a 0..1 cell mask. */
  setFloodExtent(fc: GeoJSON.FeatureCollection) {
    if (fc === this.lastFloodFc) return; // already rasterised this extent
    this.lastFloodFc = fc;
    const grid = DEM as Grid;
    const [lng0, lat0, lng1, lat1] = grid.bbox;
    const mask = new Float32Array(this.N);
    const rings: number[][][] = [];
    for (const f of fc.features || []) {
      const g = f.geometry;
      if (!g) continue;
      if (g.type === 'Polygon') rings.push(...(g.coordinates as number[][][]));
      else if (g.type === 'MultiPolygon') for (const poly of g.coordinates as number[][][][]) rings.push(...poly);
    }
    const inRing = (lng: number, lat: number, ring: number[][]) => {
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
        if (((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) inside = !inside;
      }
      return inside;
    };
    // bbox prefilter per ring so we only PIP-test cells near each polygon
    for (const ring of rings) {
      let rminX = 1e9, rminY = 1e9, rmaxX = -1e9, rmaxY = -1e9;
      for (const p of ring) { rminX = Math.min(rminX, p[0]); rmaxX = Math.max(rmaxX, p[0]); rminY = Math.min(rminY, p[1]); rmaxY = Math.max(rmaxY, p[1]); }
      const gi0 = Math.max(0, Math.floor((rminX - lng0) / (lng1 - lng0) * (this.NX - 1)));
      const gi1 = Math.min(this.NX - 1, Math.ceil((rmaxX - lng0) / (lng1 - lng0) * (this.NX - 1)));
      const gj0 = Math.max(0, Math.floor((rminY - lat0) / (lat1 - lat0) * (this.NY - 1)));
      const gj1 = Math.min(this.NY - 1, Math.ceil((rmaxY - lat0) / (lat1 - lat0) * (this.NY - 1)));
      for (let j = gj0; j <= gj1; j++) for (let i = gi0; i <= gi1; i++) {
        const lng = lng0 + (lng1 - lng0) * i / (this.NX - 1);
        const lat = lat0 + (lat1 - lat0) * j / (this.NY - 1);
        if (inRing(lng, lat, ring)) mask[j * this.NX + i] = 1;
      }
    }
    // one blur pass softens the boundary so the water edge isn't a hard staircase
    const out = new Float32Array(this.N);
    for (let j = 0; j < this.NY; j++) for (let i = 0; i < this.NX; i++) {
      let s = 0, n = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = i + di, jj = j + dj;
        if (ii >= 0 && ii < this.NX && jj >= 0 && jj < this.NY) { s += mask[jj * this.NX + ii]; n++; }
      }
      out[j * this.NX + i] = s / n;
    }
    void out; // softened mask computed for parity; not consumed by the current renderer
  }

  private smooth(passes: number) {
    for (let p = 0; p < passes; p++) {
      const out = new Float32Array(this.N);
      for (let j = 0; j < this.NY; j++) for (let i = 0; i < this.NX; i++) {
        let sum = 0, n = 0;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          const ii = i + di, jj = j + dj;
          if (ii >= 0 && ii < this.NX && jj >= 0 && jj < this.NY) { sum += this.b[jj * this.NX + ii]; n++; }
        }
        out[j * this.NX + i] = sum / n;
      }
      this.b.set(out);
    }
  }

  private simStep() {
    if (this.targetStage <= 0.001) return;
    this.stage += (this.targetStage - this.stage) * 0.012; // slow, watchable rise
    const nx = this.NX, ny = this.NY, b = this.b, d = this.d;
    const fL = this.fL, fR = this.fR, fT = this.fT, fB = this.fB;
    const cell = this.cellM, dt = this.dt, speed = this.speed;
    const surf = this.basinFloor + this.stage;
    for (const k of this.src) { const want = surf - b[k]; if (want > d[k]) d[k] = want; }
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i, hs = b[k] + d[k];
      const hl = i > 0 ? b[k - 1] + d[k - 1] : hs, hr = i < nx - 1 ? b[k + 1] + d[k + 1] : hs;
      const ht = j < ny - 1 ? b[k + nx] + d[k + nx] : hs, hb = j > 0 ? b[k - nx] + d[k - nx] : hs;
      fL[k] = Math.max(0, fL[k] + speed * dt * cell * this.g * (hs - hl) / cell);
      fR[k] = Math.max(0, fR[k] + speed * dt * cell * this.g * (hs - hr) / cell);
      fT[k] = Math.max(0, fT[k] + speed * dt * cell * this.g * (hs - ht) / cell);
      fB[k] = Math.max(0, fB[k] + speed * dt * cell * this.g * (hs - hb) / cell);
      const total = (fL[k] + fR[k] + fT[k] + fB[k]) * dt, vol = d[k] * cell * cell;
      if (total > vol && total > 0) { const s = vol / total; fL[k] *= s; fR[k] *= s; fT[k] *= s; fB[k] *= s; }
    }
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const inf = (i > 0 ? fR[k - 1] : 0) + (i < nx - 1 ? fL[k + 1] : 0) + (j > 0 ? fT[k - nx] : 0) + (j < ny - 1 ? fB[k + nx] : 0);
      const out = fL[k] + fR[k] + fT[k] + fB[k];
      d[k] += dt * (inf - out) / (cell * cell);
      if (d[k] < 0) d[k] = 0;
    }
  }

  onAdd(map: maplibregl.Map, gl: WebGLRenderingContext) {
    this.map = map;
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl as WebGL2RenderingContext, antialias: true });
    this.renderer.autoClear = false;

    const grid = DEM as Grid;
    const [lng0, lat0, lng1, lat1] = grid.bbox;
    const cLng = (lng0 + lng1) / 2, cLat = (lat0 + lat1) / 2;
    const mPerLat = 110540, mPerLng = 111320 * Math.cos(cLat * Math.PI / 180);

    const X = new Float32Array(this.N), Y = new Float32Array(this.N);
    for (let j = 0; j < this.NY; j++) for (let i = 0; i < this.NX; i++) {
      const k = j * this.NX + i;
      const lng = lng0 + (lng1 - lng0) * i / (this.NX - 1);
      const lat = lat0 + (lat1 - lat0) * j / (this.NY - 1);
      X[k] = (lng - cLng) * mPerLng;
      Y[k] = (lat - cLat) * mPerLat;
    }
    const tri: number[] = [];
    for (let j = 0; j < this.NY - 1; j++) for (let i = 0; i < this.NX - 1; i++) {
      const a = j * this.NX + i, bb = a + 1, c = a + this.NX, dd = c + 1;
      tri.push(a, c, bb, bb, c, dd);
    }

    this.waterGeo = new THREE.BufferGeometry();
    const wpos = new Float32Array(this.N * 3), wdep = new Float32Array(this.N);
    for (let k = 0; k < this.N; k++) { wpos[k * 3] = X[k]; wpos[k * 3 + 1] = Y[k]; wpos[k * 3 + 2] = -1e6; }
    this.waterGeo.setAttribute('position', new THREE.BufferAttribute(wpos, 3));
    this.waterGeo.setAttribute('aDepth', new THREE.BufferAttribute(wdep, 1));
    this.waterGeo.setIndex(new THREE.BufferAttribute(new Uint32Array(tri), 1));

    this.waterMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `attribute float aDepth; varying float vD; varying vec2 vXY;
        void main(){ vD=aDepth; vXY=position.xy;
          gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `varying float vD; varying vec2 vXY; uniform float uTime;
        void main(){ if(vD<0.05) discard;
          vec3 shallow=vec3(0.34,0.78,0.88), mid=vec3(0.06,0.36,0.56), deep=vec3(0.01,0.09,0.32);
          float t=clamp(vD/4.5,0.0,1.0);
          vec3 base=t<0.5?mix(shallow,mid,t/0.5):mix(mid,deep,(t-0.5)/0.5);
          float nx=0.10*sin(vXY.x/90.0+uTime*1.8)+0.06*sin((vXY.x+vXY.y)/150.0+uTime*1.2);
          float ny=0.10*sin(vXY.y/85.0-uTime*1.6)+0.06*sin((vXY.x-vXY.y)/170.0-uTime*1.4);
          vec3 N=normalize(vec3(nx,ny,1.0));
          vec3 L=normalize(vec3(0.42,0.5,0.85));
          vec3 V=vec3(0.0,0.0,1.0);
          vec3 H=normalize(L+V);
          float spec=pow(max(dot(N,H),0.0),45.0);
          float fres=pow(1.0-N.z,2.0);
          vec3 col=base+spec*0.5+fres*vec3(0.22,0.38,0.48);
          float a=clamp(0.32+vD*0.08,0.0,0.84);
          gl_FragColor=vec4(col,a); }`,
    });
    const water = new THREE.Mesh(this.waterGeo, this.waterMat);
    water.frustumCulled = false; water.renderOrder = 1;
    this.scene.add(water);

    this.local = new THREE.Matrix4()
      .makeTranslation(this.origin.x, this.origin.y, this.origin.z)
      .scale(new THREE.Vector3(this.scaleM, -this.scaleM, this.scaleM));
  }

  render(_gl: WebGLRenderingContext, args: any) {
    if (this.targetStage <= 0.001 || this.map.getZoom() < this.minVisibleZoom) {
      return;
    }
    const wp = this.waterGeo.attributes.position.array as Float32Array;
    const wd = this.waterGeo.attributes.aDepth.array as Float32Array;
    if (this.mode === 'flood') {
      // Step 5: river water flows out of the channels and FILLS the low haor
      // basin (shallow-water sim). Depth follows the real terrain — deep in the
      // low haor centres, shallow at the rim = how much water actually pools.
      this.simStep();
      for (let k = 0; k < this.N; k++) {
        const dep = this.d[k];
        wd[k] = dep;
        wp[k * 3 + 2] = (this.b[k] + dep) * EXAG;
      }
    } else {
      // Step 4 (river surge): water stays RIVER-SIZED — confined to the channel
      // mask, rising/deepening in place (no lateral spread over houses).
      this.stage += (this.targetStage - this.stage) * 0.012; // slow, watchable swell
      const mask = this.riverMask;
      for (let k = 0; k < this.N; k++) {
        const m = mask[k];
        const dep = m > 0.05 ? m * this.stage : 0;
        wd[k] = dep;
        wp[k * 3 + 2] = (this.b[k] + dep) * EXAG;
      }
    }
    this.waterGeo.attributes.position.needsUpdate = true;
    this.waterGeo.attributes.aDepth.needsUpdate = true;
    this.waterMat.uniforms.uTime.value = performance.now() * 0.001;

    const raw = (args && args.defaultProjectionData && args.defaultProjectionData.mainMatrix) || args;
    this.camera.projectionMatrix = new THREE.Matrix4().fromArray(raw as number[]).multiply(this.local);
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
    this.map.triggerRepaint();
  }

  onRemove() { this.waterGeo?.dispose(); this.waterMat?.dispose(); }
}
