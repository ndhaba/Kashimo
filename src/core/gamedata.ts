import {Bot} from "mineflayer";
import {Item} from "prismarine-item";

import mcdata from "minecraft-data";

export enum ToolType {
  Sword = 1, Pickaxe, Axe, Shovel, Hoe, Shears
};

export enum ToolMaterial {
  Wood = 1, Stone, Gold, Iron, Diamond, Netherite
}

export type Tool = {
  slot: number,
  type: ToolType,
  material: ToolMaterial,
  durability: number,
  enchants: {[x: string]: number}
}

export class GameData {
  public data: mcdata.IndexedData;

  /**
   * Creates an abstraction layer for the game data
   * @param bot The bot
   */
  constructor(bot: Bot){
    this.data = mcdata(bot.version);
  }

  /**
   * Converts the given item to a tool object
   * @param item The item
   * @returns A Tool object
   */
  toTool(item: Item): Tool | undefined {
    // initial variables
    var data = this.data.items[item.type];
    var type: ToolType;
    var material: ToolMaterial;
    var enchants: {[x: string]: number} = {};
    // make sure the stack size is 1 and it's enchantable
    if(data.stackSize != 1 || data.enchantCategories === undefined){
      return;
    }
    // split up the name into sections
    var nameParts = item.name.split("_");
    // the last section is the tool type
    switch(nameParts.pop()){
      case "sword": type = ToolType.Sword; break;
      case "pickaxe": type = ToolType.Pickaxe; break;
      case "axe": type = ToolType.Axe; break;
      case "shovel": type = ToolType.Shovel; break;
      case "hoe": type = ToolType.Hoe; break;
      case "shears": type = ToolType.Shears; break;
      default: return;
    }
    // the first section is the material
    if(type == ToolType.Shears){
      // special case: shears (no material in name)
      material = ToolMaterial.Iron;
    }else{
      // everything else
      switch(nameParts[0]){
        case "wooden": material = ToolMaterial.Wood; break;
        case "stone": material = ToolMaterial.Stone; break;
        case "golden": material = ToolMaterial.Gold; break;
        case "iron": material = ToolMaterial.Iron; break;
        case "diamond": material = ToolMaterial.Diamond; break;
        case "netherite": material = ToolMaterial.Netherite; break;
        default: return;
      }
    }
    // organize all of the enchants
    for(let enchant of item.enchants){
      enchants[enchant.name] = enchant.lvl;
    }
    // return the tool object
    return {
      type, material, enchants,
      slot: item.slot,
      durability: 1 - (item.durabilityUsed / item.maxDurability)
    };
  }
}

declare module "mineflayer" {
  interface Bot {
    gameData: GameData
  }
}