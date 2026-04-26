import type { MapData, Team } from '../types/game';

interface MapDataJSON {
  data: Record<string, MapBuildingJSON[]>;
}

interface MapBuildingJSON {
  name: string;
  x: number;
  y: number;
  z: number;
  team?: number;
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
    const mapdataJson: MapDataJSON = await mapdataResponse.json();
    
    for (const [, entities] of Object.entries(mapdataJson.data)) {
      for (const entity of entities) {
        const team: Team = entity.team === 2 ? 'radiant' : entity.team === 3 ? 'dire' : 'neutral';
        
        if (entity.name?.startsWith('ent_dota_tree')) {
          result.trees.push({
            name: entity.name,
            x: entity.x,
            y: entity.y,
            z: entity.z,
          });
        } else if (
          entity.name?.includes('tower') ||
          entity.name?.includes('barracks') ||
          entity.name?.includes('fort') ||
          entity.name?.includes('fountain') ||
          entity.name?.includes('shop')
        ) {
          result.buildings.push({
            name: entity.name,
            x: entity.x,
            y: entity.y,
            z: entity.z,
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
    report('mapdata.json loaded', 1, 5);

    report('Loading gridnavdata.json...');
    const gridNavResponse = await fetch(`${mapdataPath}/data/gridnavdata.json`);
    const gridNavJson: GridNavJSON = await gridNavResponse.json();
    result.gridNav = gridNavJson.data;
    report('gridnavdata.json loaded', 2, 5);

    report('Loading elevationdata.json...');
    const elevationResponse = await fetch(`${mapdataPath}/data/elevationdata.json`);
    const elevationJson: ElevationJSON = await elevationResponse.json();
    result.elevation = elevationJson.data;
    report('elevationdata.json loaded', 3, 5);

    report('Loading lanedata.json...');
    const laneResponse = await fetch(`${mapdataPath}/data/lanedata.json`);
    const laneJson: LaneDataJSON = await laneResponse.json();
    
    for (const feature of laneJson.features) {
      const laneName = feature.properties.name;
      const coords = feature.geometry.coordinates;
      result.lanes[laneName] = coords.map(([x, y]) => ({ x, y }));
    }
    report('lanedata.json loaded', 4, 5);
  } catch (error) {
    console.error('Error loading map data:', error);
  }

  return result;
}