import type { MapData, Team } from '../types/game';

interface MapEntityJSON {
  name?: string | null;
  x?: number;
  y?: number;
  z?: number;
  team?: number;
}

interface MapDataJSON {
  data: Record<string, MapEntityJSON[]>;
}

interface GridNavJSON {
  data: Array<{ x: number; y: number }>;
}

interface ElevationJSON {
  data: Array<Array<number>>;
}

interface LaneDataJSON {
  type: string;
  features: Array<{
    properties: { name: string };
    geometry: { coordinates: Array<[number, number]> };
  }>;
}

// Map leamare team IDs to our Team type.
// team 2 = radiant (good guys), team 3 = dire (bad guys)
function teamFromId(teamId?: number): Team {
  if (teamId === 2) return 'radiant';
  if (teamId === 3) return 'dire';
  return 'neutral';
}

// Category keys that represent buildings/structures
const BUILDING_CATEGORIES = new Set([
  'npc_dota_tower',
  'npc_dota_barracks',
  'npc_dota_fort',
  'ent_dota_fountain',
  'ent_dota_shop',
  'npc_dota_watch_tower',
]);

// Category key for trees
const TREE_CATEGORY = 'ent_dota_tree';

export async function loadMapData(
  mapdataPath: string,
  onProgress?: (loaded: number, total: number, file: string) => void
): Promise<MapData> {
  const result: MapData = {
    buildings: [],
    trees: [],
    gridNav: [],
    elevation: [],
    lanes: {},
    spawnPoints: {
      radiant: { x: -7000, y: -7000 },
      dire: { x: 7000, y: 7000 },
      neutral: { x: 0, y: 0 },
    },
  };

  const report = (file: string, loaded = 0, total = 0) => {
    onProgress?.(loaded, total, file);
  };

  try {
    report('Loading mapdata.json...');
    const mapdataResponse = await fetch(`${mapdataPath}/mapdata.json`);
    if (!mapdataResponse.ok) throw new Error(`Failed to fetch mapdata.json: ${mapdataResponse.status}`);
    const mapdataJson: MapDataJSON = await mapdataResponse.json();

    for (const [categoryKey, entities] of Object.entries(mapdataJson.data)) {
      for (const entity of entities) {
        // Skip entities without coordinates
        if (entity.x == null || entity.y == null) continue;

        const team = teamFromId(entity.team);
        const z = entity.z ?? 0;

        if (categoryKey === TREE_CATEGORY) {
          result.trees.push({
            name: entity.name ?? categoryKey,
            x: entity.x,
            y: entity.y,
            z,
          });
        } else if (BUILDING_CATEGORIES.has(categoryKey)) {
          result.buildings.push({
            name: entity.name ?? categoryKey,
            x: entity.x,
            y: entity.y,
            z,
            team,
            bounds: {
              minX: entity.x - 64,
              maxX: entity.x + 64,
              minY: entity.y - 64,
              maxY: entity.y + 64,
            },
          });
        }
      }
    }
    report('mapdata.json loaded', 1, 4);

    report('Loading gridnavdata.json...');
    const gridNavResponse = await fetch(`${mapdataPath}/gridnavdata.json`);
    if (!gridNavResponse.ok) throw new Error(`Failed to fetch gridnavdata.json: ${gridNavResponse.status}`);
    const gridNavJson: GridNavJSON = await gridNavResponse.json();
    result.gridNav = gridNavJson.data;
    report('gridnavdata.json loaded', 2, 4);

    report('Loading elevationdata.json...');
    const elevationResponse = await fetch(`${mapdataPath}/elevationdata.json`);
    if (!elevationResponse.ok) throw new Error(`Failed to fetch elevationdata.json: ${elevationResponse.status}`);
    const elevationJson: ElevationJSON = await elevationResponse.json();
    result.elevation = elevationJson.data;
    report('elevationdata.json loaded', 3, 4);

    report('Loading lanedata.json...');
    const laneResponse = await fetch(`${mapdataPath}/lanedata.json`);
    if (!laneResponse.ok) throw new Error(`Failed to fetch lanedata.json: ${laneResponse.status}`);
    const laneJson: LaneDataJSON = await laneResponse.json();

    for (const feature of laneJson.features) {
      const laneName = feature.properties.name;
      const coords = feature.geometry.coordinates;
      result.lanes[laneName] = coords.map(([x, y]) => ({ x, y }));
    }
    report('lanedata.json loaded', 4, 4);
  } catch (error) {
    console.error('Error loading map data:', error);
    throw error;
  }

  console.log(
    `Map loaded: ${result.buildings.length} buildings, ${result.trees.length} trees, ` +
    `${result.gridNav.length} walkable cells, ${Object.keys(result.lanes).length} lane paths`
  );

  return result;
}
