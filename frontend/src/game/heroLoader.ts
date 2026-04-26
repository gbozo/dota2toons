import * as THREE from 'three';

export interface HeroDefinition {
  name: string;
  modelPath: string;
  animations: string[];
  scale: number;
}

export interface LoadedHero {
  definition: HeroDefinition;
  model: THREE.Group;
  animations: Map<string, THREE.AnimationClip>;
}

interface HeroInfo {
  name: string;
  scale: number;
}

const heroData: Record<string, HeroInfo> = {
  'axe': { name: 'Axe', scale: 1.0 },
  'abaddon': { name: 'Abaddon', scale: 1.0 },
  'alchemist': { name: 'Alchemist', scale: 1.0 },
  'anti_mage': { name: 'Anti Mage', scale: 1.0 },
  'ancient_apparition': { name: 'Ancient Apparition', scale: 1.0 },
  'blood_seeker': { name: 'Bloodseeker', scale: 1.0 },
  'bounty_hunter': { name: 'Bounty Hunter', scale: 1.0 },
  'brewmaster': { name: 'Brewmaster', scale: 1.0 },
  'bristleback': { name: 'Bristleback', scale: 1.0 },
  'centaur': { name: 'Centaur Warrunner', scale: 1.0 },
  'chaos_knight': { name: 'Chaos Knight', scale: 1.0 },
  'chen': { name: 'Chen', scale: 1.0 },
  'clinkz': { name: 'Clinkz', scale: 1.0 },
  'crystal_maiden': { name: 'Crystal Maiden', scale: 1.0 },
  'dark_seer': { name: 'Dark Seer', scale: 1.0 },
  'dazzle': { name: 'Dazzle', scale: 1.0 },
  'death_prophet': { name: 'Death Prophet', scale: 1.0 },
  'disjoint': { name: 'Disruptor', scale: 1.0 },
  'doom_bringer': { name: 'Doom', scale: 1.0 },
  'dragon_knight': { name: 'Dragon Knight', scale: 1.0 },
  'earth_spirit': { name: 'Earth Spirit', scale: 1.0 },
  'earthshaker': { name: 'Earthshaker', scale: 1.0 },
  'elder_titan': { name: 'Elder Titan', scale: 1.0 },
  'ember_spirit': { name: 'Ember Spirit', scale: 1.0 },
  'enchantress': { name: 'Enchantress', scale: 1.0 },
  'enigma': { name: 'Enigma', scale: 1.0 },
  'faceless_void': { name: 'Faceless Void', scale: 1.0 },
  'gyrocopter': { name: 'Gyrocopter', scale: 1.0 },
  'hero': { name: 'Hero', scale: 1.0 },
  'huskar': { name: 'Huskar', scale: 1.0 },
  'invoker': { name: 'Invoker', scale: 1.0 },
  'io_j': { name: 'Io', scale: 1.0 },
  'jakiro': { name: 'Jakiro', scale: 1.0 },
  'juggernaut': { name: 'Juggernaut', scale: 1.0 },
  'keeper_of_the_light': { name: 'Keeper of the Light', scale: 1.0 },
  'kunkka': { name: 'Kunkka', scale: 1.0 },
  'legion_commander': { name: 'Legion Commander', scale: 1.0 },
  'leshrac': { name: 'Leshrac', scale: 1.0 },
  'lich': { name: 'Lich', scale: 1.0 },
  'lifestealer': { name: 'Lifestealer', scale: 1.0 },
  'lion': { name: 'Lion', scale: 1.0 },
  'luna': { name: 'Luna', scale: 1.0 },
  'lycan': { name: 'Lycan', scale: 1.0 },
  'magnus': { name: 'Magnus', scale: 1.0 },
  'medusa': { name: 'Medusa', scale: 1.0 },
  'meepo': { name: 'Meepo', scale: 1.0 },
  'mirana': { name: 'Mirana', scale: 1.0 },
  'morphling': { name: 'Morphling', scale: 1.0 },
  'naga_siren': { name: 'Naga Siren', scale: 1.0 },
  'necrolyte': { name: 'Necrophos', scale: 1.0 },
  'night_stalker': { name: 'Night Stalker', scale: 1.0 },
  'ogre_magi': { name: 'Ogre Magi', scale: 1.0 },
  'omniknight': { name: 'Omniknight', scale: 1.0 },
  'oracle': { name: 'Oracle', scale: 1.0 },
  'phantom_assassin': { name: 'Phantom Assassin', scale: 1.0 },
  'phantom_lancer': { name: 'Phantom Lancer', scale: 1.0 },
  'phoenix': { name: 'Phoenix', scale: 1.0 },
  'puck': { name: 'Puck', scale: 1.0 },
  'pudge': { name: 'Pudge', scale: 1.0 },
  'pugna': { name: 'Pugna', scale: 1.0 },
  'queen_of_pain': { name: 'Queen of Pain', scale: 1.0 },
  'razor': { name: 'Razor', scale: 1.0 },
  'riKI': { name: 'Riki', scale: 1.0 },
  'rubick': { name: 'Rubick', scale: 1.0 },
  'sandbox': { name: 'Sand King', scale: 1.0 },
  'shadow_demon': { name: 'Shadow Demon', scale: 1.0 },
  'shadow_shaman': { name: 'Shadow Shaman', scale: 1.0 },
  'silencer': { name: 'Silencer', scale: 1.0 },
  'skeleton_king': { name: 'Wraith King', scale: 1.0 },
  'skywrath_mage': { name: 'Skywrath Mage', scale: 1.0 },
  'slardar': { name: 'Slardar', scale: 1.0 },
  'slark': { name: 'Slark', scale: 1.0 },
  'sniper': { name: 'Sniper', scale: 1.0 },
  'specter': { name: 'Spectre', scale: 1.0 },
  'storm_spirit': { name: 'Storm Spirit', scale: 1.0 },
  'sven': { name: 'Sven', scale: 1.0 },
  'techies': { name: 'Techies', scale: 1.0 },
  'templar_assassin': { name: 'Templar Assassin', scale: 1.0 },
  'terrorblade': { name: 'Terrorblade', scale: 1.0 },
  'tidehunter': { name: 'Tidehunter', scale: 1.0 },
  'timbersaw': { name: 'Timbersaw', scale: 1.0 },
  'tiny': { name: 'Tiny', scale: 1.0 },
  'treant': { name: 'Treant Protector', scale: 1.0 },
  'troll_warlord': { name: 'Troll Warlord', scale: 1.0 },
  'tusk': { name: 'Tusk', scale: 1.0 },
  'undying': { name: 'Undying', scale: 1.0 },
  'ursa': { name: 'Ursa', scale: 1.0 },
  'venoman': { name: 'Venomancer', scale: 1.0 },
  'viper': { name: 'Viper', scale: 1.0 },
  'visage': { name: 'Visage', scale: 1.0 },
  'void_spirit': { name: 'Void Spirit', scale: 1.0 },
  'warlock': { name: 'Warlock', scale: 1.0 },
  'weaver': { name: 'Weaver', scale: 1.0 },
  'windrunner': { name: 'Windranger', scale: 1.0 },
  'winters_wyvern': { name: 'Winter Wyvern', scale: 1.0 },
  'witch_doctor': { name: 'Witch Doctor', scale: 1.0 },
  'wraith_king': { name: 'Wraith King', scale: 1.0 },
  'zeus': { name: 'Zeus', scale: 1.0 },
};

export class HeroModelLoader {
  private basePath: string;

  constructor(basePath: string = '/heroes') {
    this.basePath = basePath;
  }

  getAvailableHeroes(): string[] {
    return Object.keys(heroData);
  }

  getHeroInfo(heroKey: string): HeroInfo | undefined {
    return heroData[heroKey];
  }

  getPath() { return this.basePath; }

  createHeroInstance(heroKey: string): THREE.Object3D {
    const heroInfo = heroData[heroKey];
    if (!heroInfo) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(32),
        new THREE.MeshLambertMaterial({ color: 0xff00ff })
      );
      mesh.position.y = 32;
      return mesh;
    }

    const color = heroKey === 'axe' ? 0x4488ff : heroKey === 'pudge' ? 0xff8844 : 0x44ff88;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(48, 96, 48),
      new THREE.MeshLambertMaterial({ color })
    );
    mesh.position.y = 48;
    mesh.name = heroKey;
    
    return mesh;
  }
}