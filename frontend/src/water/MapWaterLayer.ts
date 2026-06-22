// Real shallow-water flood as a MapLibre custom layer — the water physics
// rendered ON the live Lighthouse map (geo-aligned over the Sirajganj bbox), not a
// separate view. Virtual-pipes simulation on a real DEM; the resulting water
// depth is drawn as a translucent, depth-graded surface that sits on the map.
import * as THREE from 'three';
import maplibregl from 'maplibre-gl';
import DEM from './sirajganj_dem.json';

type Grid = { nx: number; ny: number; bbox: number[]; elev: number[][] };

export class MapWaterLayer implements maplibregl.CustomLayerInterface {
  id = 'sirajganj-water';
  type = 'custom' as const;
  renderingMode = '3d' as const;

  private map!: maplibregl.Map;
  private renderer!: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.Camera();
  private mesh!: THREE.Mesh;
  private geo!: THREE.BufferGeometry;
  private mat!: THREE.ShaderMaterial;

  // grid / sim
  private NX: number; private NY: number; private N: number;
  private b: Float32Array;          // terrain (cleaned)
  private d: Float32Array;          // water depth
  private fL: Float32Array; private fR: Float32Array; private fT: Float32Array; private fB: Float32Array;
  private src: number[] = [];
  private GROUND_MED = 0;
  private CELL_M = 78; private G = 9.81; private DT = 0.05; private SPEED = 4;
  private stage = 0;                // metres above median ground (river level)

  // geo transform
  private origin: maplibregl.MercatorCoordinate;
  private scaleM: number;
  private L = new THREE.Matrix4();
  private readonly minVisibleZoom = 9.2;

  constructor() {
    const g = DEM as Grid;
    this.NX = g.nx; this.NY = g.ny; this.N = g.nx * g.ny;
    this.b = new Float32Array(this.N);
    for (let j = 0; j < this.NY; j++) for (let i = 0; i < this.NX; i++)
      this.b[j * this.NX + i] = Math.max(2, Math.min(35, g.elev[j][i]));
    this.smooth(3);
    const sorted = Array.from(this.b).sort((a, c) => a - c);
    const pct = (p: number) => sorted[Math.floor(p / 100 * (this.N - 1))];
    this.GROUND_MED = pct(50);
    const p15 = pct(15);
    for (let j = 0; j < this.NY; j++) for (let i = 0; i < this.NX; i++) {
      const k = j * this.NX + i;
      if (i >= this.NX - 3 || this.b[k] <= p15) this.src.push(k);
    }
    this.d = new Float32Array(this.N);
    this.fL = new Float32Array(this.N); this.fR = new Float32Array(this.N);
    this.fT = new Float32Array(this.N); this.fB = new Float32Array(this.N);

    // geo origin = bbox centre
    const [LNG0, LAT0, LNG1, LAT1] = g.bbox;
    const cLng = (LNG0 + LNG1) / 2, cLat = (LAT0 + LAT1) / 2;
    this.origin = maplibregl.MercatorCoordinate.fromLngLat([cLng, cLat], 0);
    this.scaleM = this.origin.meterInMercatorCoordinateUnits();
  }

  /** river level 0..1 → metres above median ground */
  setLevel(frac: number, maxM = 12) { this.stage = Math.max(0, Math.min(1, frac)) * maxM; }

  private smooth(passes: number) {
    for (let p = 0; p < passes; p++) {
      const o = new Float32Array(this.N);
      for (let j = 0; j < this.NY; j++) for (let i = 0; i < this.NX; i++) {
        let s = 0, n = 0;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          const ii = i + di, jj = j + dj;
          if (ii >= 0 && ii < this.NX && jj >= 0 && jj < this.NY) { s += this.b[jj * this.NX + ii]; n++; }
        }
        o[j * this.NX + i] = s / n;
      }
      this.b.set(o);
    }
  }

  private simStep() {
    const NX = this.NX, NY = this.NY, b = this.b, d = this.d;
    const fL = this.fL, fR = this.fR, fT = this.fT, fB = this.fB;
    const L = this.CELL_M, A = L, G = this.G, DT = this.DT, SP = this.SPEED;
    const surf = this.GROUND_MED + this.stage;
    for (const k of this.src) { const want = surf - b[k]; if (want > d[k]) d[k] = want; }
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const k = j * NX + i, hs = b[k] + d[k];
      const hl = i > 0 ? b[k - 1] + d[k - 1] : hs, hr = i < NX - 1 ? b[k + 1] + d[k + 1] : hs;
      const ht = j < NY - 1 ? b[k + NX] + d[k + NX] : hs, hb = j > 0 ? b[k - NX] + d[k - NX] : hs;
      fL[k] = Math.max(0, fL[k] + SP * DT * A * G * (hs - hl) / L);
      fR[k] = Math.max(0, fR[k] + SP * DT * A * G * (hs - hr) / L);
      fT[k] = Math.max(0, fT[k] + SP * DT * A * G * (hs - ht) / L);
      fB[k] = Math.max(0, fB[k] + SP * DT * A * G * (hs - hb) / L);
      const tot = (fL[k] + fR[k] + fT[k] + fB[k]) * DT, vol = d[k] * L * L;
      if (tot > vol && tot > 0) { const s = vol / tot; fL[k] *= s; fR[k] *= s; fT[k] *= s; fB[k] *= s; }
    }
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const k = j * NX + i;
      const inf = (i > 0 ? fR[k - 1] : 0) + (i < NX - 1 ? fL[k + 1] : 0) + (j > 0 ? fT[k - NX] : 0) + (j < NY - 1 ? fB[k + NX] : 0);
      const out = fL[k] + fR[k] + fT[k] + fB[k];
      d[k] += DT * (inf - out) / (L * L); if (d[k] < 0) d[k] = 0;
    }
  }

  onAdd(map: maplibregl.Map, gl: WebGLRenderingContext) {
    this.map = map;
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl as WebGL2RenderingContext, antialias: true });
    this.renderer.autoClear = false;

    const g = DEM as Grid;
    const [LNG0, LAT0, LNG1, LAT1] = g.bbox;
    const cLng = (LNG0 + LNG1) / 2, cLat = (LAT0 + LAT1) / 2;
    const mPerLat = 110540, mPerLng = 111320 * Math.cos(cLat * Math.PI / 180);

    // water grid geometry in local metres: x=east, y=north, z=altitude(=depth)
    this.geo = new THREE.BufferGeometry();
    const pos = new Float32Array(this.N * 3);
    const dep = new Float32Array(this.N);
    for (let j = 0; j < this.NY; j++) for (let i = 0; i < this.NX; i++) {
      const k = j * this.NX + i;
      const lng = LNG0 + (LNG1 - LNG0) * i / (this.NX - 1);
      const lat = LAT0 + (LAT1 - LAT0) * j / (this.NY - 1);
      pos[k * 3] = (lng - cLng) * mPerLng;       // east
      pos[k * 3 + 1] = (lat - cLat) * mPerLat;   // north
      pos[k * 3 + 2] = 0;                          // altitude (set per frame)
    }
    const tri: number[] = [];
    for (let j = 0; j < this.NY - 1; j++) for (let i = 0; i < this.NX - 1; i++) {
      const a = j * this.NX + i, bb = a + 1, c = a + this.NX, dd = c + 1;
      tri.push(a, c, bb, bb, c, dd);
    }
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.geo.setAttribute('aDepth', new THREE.BufferAttribute(dep, 1));
    this.geo.setIndex(tri);

    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `attribute float aDepth; varying float vD;
        void main(){ vD=aDepth; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `varying float vD; uniform float uTime;
        void main(){ if(vD<0.06) discard;
          vec3 shallow=vec3(0.30,0.66,0.92), deep=vec3(0.02,0.10,0.40);
          float t=clamp(vD/8.0,0.0,1.0);
          vec3 col=mix(shallow,deep,t);
          col += 0.05*sin(uTime*2.0+vD*3.0);
          float a=clamp(0.42+vD*0.10,0.0,0.85);
          gl_FragColor=vec4(col,a); }`,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);

    this.L = new THREE.Matrix4()
      .makeTranslation(this.origin.x, this.origin.y, this.origin.z)
      .scale(new THREE.Vector3(this.scaleM, -this.scaleM, this.scaleM));
  }

  // MapLibre v5 passes (gl, options); older passes (gl, matrix[]).
  render(_gl: WebGLRenderingContext, args: any) {
    if (this.map.getZoom() < this.minVisibleZoom) {
      this.map.triggerRepaint();
      return;
    }
    // step the simulation (1–2 substeps)
    this.simStep();
    // update altitude (z) + depth attribute
    const pa = this.geo.attributes.position.array as Float32Array;
    const da = this.geo.attributes.aDepth.array as Float32Array;
    for (let k = 0; k < this.N; k++) { const dep = this.d[k]; da[k] = dep; pa[k * 3 + 2] = dep; }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aDepth.needsUpdate = true;
    this.mat.uniforms.uTime.value = performance.now() * 0.001;

    const mat = (args && args.defaultProjectionData && args.defaultProjectionData.mainMatrix) || args;
    const m = new THREE.Matrix4().fromArray(mat as number[]);
    this.camera.projectionMatrix = m.multiply(this.L);
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
    this.map.triggerRepaint();
  }

  onRemove() { this.geo?.dispose(); this.mat?.dispose(); }
}
