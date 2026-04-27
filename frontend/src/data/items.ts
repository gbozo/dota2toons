/**
 * data/items.ts
 *
 * MVP item definitions per SPEC.
 */

export interface ItemDef {
  id: string;
  name: string;
  cost: number;
  category: 'consumable' | 'basic' | 'armor' | 'damage';
  description: string;
  /** Stat bonuses applied on purchase */
  bonuses: {
    hp?: number;
    mana?: number;
    damageMin?: number;
    damageMax?: number;
    armor?: number;
    moveSpeed?: number;
  };
  /** Consumable: one-time use effect */
  consumable?: {
    hpRestore?: number;
    manaRestore?: number;
    duration?: number; // ms
  };
}

export const ITEMS: ItemDef[] = [
  {
    id: 'healing_salve',
    name: 'Healing Salve',
    cost: 110,
    category: 'consumable',
    description: 'Restore 400 HP over 8s.',
    bonuses: {},
    consumable: { hpRestore: 400, duration: 8000 },
  },
  {
    id: 'clarity',
    name: 'Clarity',
    cost: 50,
    category: 'consumable',
    description: 'Restore 150 mana over 16s.',
    bonuses: {},
    consumable: { manaRestore: 150, duration: 16000 },
  },
  {
    id: 'iron_branch',
    name: 'Iron Branch',
    cost: 50,
    category: 'basic',
    description: '+1 to all stats.',
    bonuses: { hp: 20, mana: 12 },
  },
  {
    id: 'boots_of_speed',
    name: 'Boots of Speed',
    cost: 500,
    category: 'basic',
    description: '+45 move speed.',
    bonuses: { moveSpeed: 45 },
  },
  {
    id: 'blade_of_attack',
    name: 'Blade of Attack',
    cost: 450,
    category: 'damage',
    description: '+10 damage.',
    bonuses: { damageMin: 10, damageMax: 10 },
  },
  {
    id: 'chainmail',
    name: 'Chainmail',
    cost: 550,
    category: 'armor',
    description: '+5 armor.',
    bonuses: { armor: 5 },
  },
  {
    id: 'broadsword',
    name: 'Broadsword',
    cost: 1200,
    category: 'damage',
    description: '+18 damage.',
    bonuses: { damageMin: 18, damageMax: 18 },
  },
  {
    id: 'platemail',
    name: 'Platemail',
    cost: 1400,
    category: 'armor',
    description: '+10 armor.',
    bonuses: { armor: 10 },
  },
];

export const ITEM_BY_ID = new Map<string, ItemDef>(ITEMS.map(i => [i.id, i]));

export const ITEM_CATEGORIES = ['consumable', 'basic', 'damage', 'armor'] as const;
