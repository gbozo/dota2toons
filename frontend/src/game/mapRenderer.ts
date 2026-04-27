/**
 * mapRenderer.ts
 *
 * Renders the Dota 2 map from loaded MapData:
 *   - Terrain: single PlaneGeometry(20928, 20928, 326, 326) with vertex
 *     displacement from elevation data and vertex color tinting.
 *   - Trees: InstancedMesh with ConeGeometry — one draw call for all ~2475 trees.
 *   - Buildings: BoxGeometry meshes positioned from mapdata.json, team-colored.
 */

import * as THREE from 'three';
import type { MapData } from '../types/game';

// Map constants (must match AGENTS.md)
const MAP_SIZE = 20928; // world units, -10464 to +10464
const GRID_CELLS = 326; // PlaneGeometry segments (327 verts per edge)
const GRID_CELL_SIZE = 64; // world units per nav grid cell
const MAP_OFFSET = -10464; // world coordinate of grid cell [0,0]
const ELEVATION_SCALE = 80; // world units per elevation level (26 max → ~2080 units)

/** Bilinearly sample elevation at any world x/y. Returns 0 outside grid. */
function sampleElevation(elevation: number[][], wx: number, wy: number): number {
  // Use original (unrotated) grid coords — game position → elevation value.
  // The terrain mesh rotation is purely visual; coordinate lookups stay unrotated.
  const col = Math.floor((wx - MAP_OFFSET) / GRID_CELL_SIZE);
  const row = Math.floor((wy - MAP_OFFSET) / GRID_CELL_SIZE);

  if (row < 0 || row >= elevation.length || col < 0 || col >= elevation[0].length) {
    return 0;
  }

  const v = elevation[row][col];
  return v < 0 ? 0 : v;
}

// ---------------------------------------------------------------------------
// Terrain
// ---------------------------------------------------------------------------

/**
 * Builds a single PlaneGeometry covering the full 20928×20928 map with
 * vertex displacement from the 327×327 elevation grid and vertex colors
 * based on elevation height (and river/water detection).
 */
export function createTerrain(mapData: MapData): THREE.Mesh {
  const { elevation } = mapData;

  // 326 segments → 327 vertices per row/col
  const geometry = new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE, GRID_CELLS, GRID_CELLS);

  // PlaneGeometry is in XY plane; we'll rotate it to XZ (flat ground)
  // The vertex order for PlaneGeometry(w, h, ws, hs) goes left-to-right,
  // top-to-bottom in the XY plane (before rotation).

  const positions = geometry.attributes.position;
  const vertsPerRow = GRID_CELLS + 1; // 327

  // Build vertex colors buffer
  const colors = new Float32Array(positions.count * 3);

  for (let i = 0; i < positions.count; i++) {
    // PlaneGeometry vertex indices go row by row in Y-descending order
    // (top of plane = max Y = row 0 in our elevation grid's upper edge)
    const col = i % vertsPerRow;
    const row = Math.floor(i / vertsPerRow);

    // 90° clockwise rotation of elevation data:
    //   elevRow = col,  elevCol = (N-1) - row
    const N = vertsPerRow - 1; // 326
    const elevRow = col;
    const elevCol = N - row;

    let elevVal = 0;
    if (elevRow >= 0 && elevRow < elevation.length && elevCol < elevation[elevRow].length) {
      const raw = elevation[elevRow][elevCol];
      elevVal = raw < 0 ? 0 : raw; // -128 = outside map
    }

    // Displace the Z component (Y in PlaneGeometry before rotation becomes height)
    positions.setZ(i, elevVal * ELEVATION_SCALE);

    // Vertex color based on elevation
    let r: number, g: number, b: number;
    if (elevVal <= 0) {
      // Deep water / river area
      r = 0x2a / 255;
      g = 0x5a / 255;
      b = 0x7a / 255;
    } else if (elevVal <= 4) {
      // Low ground
      r = 0x2d / 255;
      g = 0x4a / 255;
      b = 0x3e / 255;
    } else if (elevVal <= 12) {
      // Mid ground
      r = 0x35 / 255;
      g = 0x55 / 255;
      b = 0x46 / 255;
    } else {
      // High ground
      r = 0x3a / 255;
      g = 0x5c / 255;
      b = 0x4e / 255;
    }

    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  const material = new THREE.MeshLambertMaterial({
    vertexColors: true,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.name = 'terrain';
  mesh.receiveShadow = true;

  return mesh;
}

// ---------------------------------------------------------------------------
// Trees — InstancedMesh for ~2475 trees in one draw call
// ---------------------------------------------------------------------------

export function createTreeInstances(mapData: MapData, elevation: number[][]): THREE.InstancedMesh {
  const trees = mapData.trees;
  const count = trees.length;

  const geometry = new THREE.ConeGeometry(18, 72, 7); // slightly irregular for cartoon feel
  const material = new THREE.MeshLambertMaterial({ color: 0x228b22 });

  const instances = new THREE.InstancedMesh(geometry, material, count);
  instances.name = 'trees';
  instances.castShadow = true;

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);

  for (let i = 0; i < count; i++) {
    const tree = trees[i];
    const elevVal = sampleElevation(elevation, tree.x, tree.y);
    position.set(tree.x, elevVal * ELEVATION_SCALE + 36, -tree.y);  // game Y → Three -Z
    matrix.compose(position, quaternion, scale);
    instances.setMatrixAt(i, matrix);
  }

  instances.instanceMatrix.needsUpdate = true;

  return instances;
}

// ---------------------------------------------------------------------------
// Buildings — BoxGeometry per structure, team-colored
// ---------------------------------------------------------------------------

const TEAM_COLORS: Record<string, number> = {
  radiant: 0x4a9eff,
  dire: 0xff4a4a,
  neutral: 0x888888,
};

export function createBuildingMeshes(mapData: MapData, elevation: number[][]): THREE.Group {
  const group = new THREE.Group();
  group.name = 'buildings';

  for (const building of mapData.buildings) {
    const color = TEAM_COLORS[building.team] ?? 0x888888;
    const elevVal = sampleElevation(elevation, building.x, building.y);

    // Scale buildings based on type name
    let width = 80;
    let height = 140;
    let depth = 80;

    const name = building.name.toLowerCase();
    if (name.includes('fort') || name.includes('ancient')) {
      width = 180; height = 240; depth = 180;
    } else if (name.includes('tower')) {
      width = 60; height = 160; depth = 60;
    } else if (name.includes('barracks') || name.includes('rax')) {
      width = 100; height = 100; depth = 100;
    } else if (name.includes('fountain')) {
      width = 200; height = 40; depth = 200;
    }

    const geometry = new THREE.BoxGeometry(width, height, depth);
    const material = new THREE.MeshLambertMaterial({ color });
    const mesh = new THREE.Mesh(geometry, material);

    mesh.position.set(building.x, elevVal * ELEVATION_SCALE + height / 2, -building.y);  // game Y → Three -Z
    mesh.name = building.name;
    mesh.castShadow = true;

    group.add(mesh);
  }

  return group;
}

// ---------------------------------------------------------------------------
// Frustum culling helper
// ---------------------------------------------------------------------------

/**
 * Updates visibility of all children in a Group based on camera frustum.
 * Call this each frame for trees/buildings.
 */
export function updateFrustumCulling(
  group: THREE.Group | THREE.InstancedMesh,
  camera: THREE.Camera,
  frustumMargin = 0
): void {
  const frustum = new THREE.Frustum();
  const projectionMatrix = new THREE.Matrix4();
  projectionMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  frustum.setFromProjectionMatrix(projectionMatrix);

  if (group instanceof THREE.Group) {
    for (const child of group.children) {
      if (child instanceof THREE.Mesh) {
        // Expand the bounding sphere for margin
        if (!child.geometry.boundingSphere) {
          child.geometry.computeBoundingSphere();
        }
        const sphere = child.geometry.boundingSphere!.clone();
        sphere.center.add(child.position);
        sphere.radius += frustumMargin;
        child.visible = frustum.intersectsSphere(sphere);
      }
    }
  }
}
