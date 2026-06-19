// Three.js custom MapLibre layer: a translucent water surface built from the
// precomputed flood-extent polygon, placed at the real-world water altitude so
// it rises against the 3D terrain + buildings as the slider moves.
import maplibregl from 'maplibre-gl';
import * as THREE from 'three';
import type { Feature, Polygon, MultiPolygon } from 'geojson';

const REF: [number, number] = [89.70, 24.45]; // Sirajganj — mercator z reference

export class WaterLayer implements maplibregl.CustomLayerInterface {
  id = 'beacon-water';
  type = 'custom' as const;
  renderingMode = '3d' as const;

  private map!: maplibregl.Map;
  private renderer!: THREE.WebGLRenderer;
  private camera = new THREE.Camera();
  private scene = new THREE.Scene();
  private mesh: THREE.Mesh | null = null;
  private material: THREE.MeshBasicMaterial;

  constructor() {
    this.material = new THREE.MeshBasicMaterial({
      color: 0x2f86d6,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }

  onAdd(map: maplibregl.Map, gl: WebGLRenderingContext) {
    this.map = map;
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
    this.renderer.autoClear = false;
  }

  /** Rebuild the water mesh for a flood polygon at the given water altitude (m). */
  setData(feature: Feature | null, altitudeM: number) {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh = null;
    }
    if (feature && feature.geometry) {
      const shapes = this.toShapes(feature.geometry as Polygon | MultiPolygon);
      if (shapes.length) {
        const geom = new THREE.ShapeGeometry(shapes);
        const z = maplibregl.MercatorCoordinate.fromLngLat(REF, altitudeM).z;
        const pos = geom.attributes.position;
        for (let i = 0; i < pos.count; i++) pos.setZ(i, z); // lift the flat sheet to water elevation
        pos.needsUpdate = true;
        this.mesh = new THREE.Mesh(geom, this.material);
        this.scene.add(this.mesh);
      }
    }
    this.map?.triggerRepaint();
  }

  private toShapes(geom: Polygon | MultiPolygon): THREE.Shape[] {
    const polys = geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates];
    const shapes: THREE.Shape[] = [];
    for (const rings of polys) {
      if (!rings.length) continue;
      const shape = new THREE.Shape(this.ring(rings[0]));
      for (let i = 1; i < rings.length; i++) shape.holes.push(new THREE.Path(this.ring(rings[i])));
      shapes.push(shape);
    }
    return shapes;
  }

  private ring(coords: number[][]): THREE.Vector2[] {
    return coords.map(([lng, lat]) => {
      const m = maplibregl.MercatorCoordinate.fromLngLat([lng, lat], 0);
      return new THREE.Vector2(m.x, m.y);
    });
  }

  render(_gl: WebGLRenderingContext, args: maplibregl.CustomRenderMethodInput) {
    const matrix = args?.defaultProjectionData?.mainMatrix;
    if (!matrix) return;
    this.camera.projectionMatrix = new THREE.Matrix4().fromArray(matrix as number[]);
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
  }
}
