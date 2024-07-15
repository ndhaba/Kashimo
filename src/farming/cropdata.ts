export enum GrowthType {
  InPlace = 1,
  Stem = 2,
  Stalk = 3
}

export type Data = {
  age: number,
  growth: GrowthType,
  harvest?: string,
  plant: string | string[],
  products: string | string[]
  seed: string
}

export const crops: Data[] = [
  {
    age: 7,
    growth: GrowthType.InPlace,
    plant: "wheat",
    products: ["wheat", "wheat_seeds"],
    seed: "wheat_seeds"
  },
  {
    age: 7,
    growth: GrowthType.InPlace,
    plant: "potatoes",
    products: ["potato", "poisonous_potato"],
    seed: "potato"
  },
  {
    age: 7,
    growth: GrowthType.InPlace,
    plant: "carrots",
    products: "carrot",
    seed: "carrot"
  },
  {
    age: 3,
    growth: GrowthType.InPlace,
    plant: "beetroots",
    products: ["beetroot", "beetroot_seeds"],
    seed: "beetroot_seeds"
  },
  {
    age: 7,
    growth: GrowthType.Stem,
    harvest: "melon",
    plant: ["melon_stem", "attached_melon_stem"],
    products: "melon",
    seed: "melon_seeds"
  },
  {
    age: 7,
    growth: GrowthType.Stem,
    harvest: "pumpkin",
    plant: ["pumpkin_stem", "attached_pumpkin_stem"],
    products: "pumpkin",
    seed: "pumpkin_seeds"
  },
  {
    age: 0, // useless
    growth: GrowthType.Stalk,
    plant: "sugar_cane",
    products: "sugar_cane",
    seed: "sugar_cane"
  },
  {
    age: 0, // useless
    growth: GrowthType.Stalk,
    plant: ["bamboo", "bamboo_sapling"],
    products: "bamboo",
    seed: "bamboo"
  }
];

export let plants: {[x: string]: Data} = {};
export let harvest: {[x: string]: Data} = {};

export let stalkGround: Set<string> = new Set(["grass_block", "sand", "dirt"]);

for(let crop of crops){
  if(crop.plant instanceof Array){
    for(let block of crop.plant){
      plants[block] = crop;
    }
  }else{
    plants[crop.plant] = crop;
  }
  if(crop.harvest){
    harvest[crop.harvest] = crop;
  }
}