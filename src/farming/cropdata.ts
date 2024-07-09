import {Bot} from "mineflayer";
import {Item} from "prismarine-item";
import {Block} from "prismarine-block";
import {world} from "prismarine-world";
import Vec3 from "vec3";
import { GameData, Tool, ToolType } from "../core/gamedata";

const stalkSet = new Set(["dirt", "grass_block", "sand"]);
const farmlandSet = new Set(["farmland"]);

type Crop = {
  harvestBlocks: string[];
  layout: "flat" | "farm" | "water";
  plantBlocks: string[];
  products: string[],
  seed: string,
  soil: Set<string>,
  replant: boolean

  canHarvest: (block: Block, world: world.WorldSync) => boolean,
  rateHarvestTool?: (tool: Tool) => number
}

const crops: Crop[] = [
  {
    harvestBlocks: ["wheat"],
    layout: "farm",
    plantBlocks: ["wheat"],
    products: ["wheat", "wheat_seeds"],
    seed: "wheat_seeds",
    soil: farmlandSet,
    replant: true,

    canHarvest(block, world) {
      return block.getProperties().age == 7;
    },
    rateHarvestTool(tool) {
      return (tool.enchants.fortune === 3 ? Infinity : tool.enchants.fortune) || 0;
    },
  },
  {
    harvestBlocks: ["potatoes"],
    layout: "farm",
    plantBlocks: ["potatoes"],
    products: ["potato", "poisonous_potato"],
    seed: "potato",
    soil: farmlandSet,
    replant: true,

    canHarvest(block, world) {
      return block.getProperties().age == 7;
    },
    rateHarvestTool(tool) {
      return (tool.enchants.fortune === 3 ? Infinity : tool.enchants.fortune) || 0;
    },
  },
  {
    harvestBlocks: ["sugar_cane"],
    layout: "water",
    plantBlocks: ["sugar_cane"],
    products: ["sugar_cane"],
    seed: "sugar_cane",
    soil: stalkSet,
    replant: false,

    canHarvest(block, world) {
      return world.getBlock(Vec3(block.position.x, block.position.y - 1, block.position.z)).name == "sugar_cane";
    }
  },
  {
    harvestBlocks: ["bamboo"],
    layout: "flat",
    plantBlocks: ["bamboo", "bamboo_sapling"],
    products: ["bamboo"],
    seed: "bamboo",
    soil: stalkSet,
    replant: false,

    canHarvest(block, world) {
      return world.getBlock(Vec3(block.position.x, block.position.y - 1, block.position.z)).name == "bamboo";
    },
    rateHarvestTool(tool) {
      if(tool.durability <= 0.2){
        return -1;
      }
      return tool.type == ToolType.Axe ? Infinity : -1;
    }
  }
];

var productLookup: {[x: string]: number} = {};
var harvestBlockLookup: {[x: string]: number} = {};

for(var i = 0; i < crops.length; ++i){
  for(let product of crops[i].products){
    productLookup[product] = i;
  }
  for(let harvestBlock of crops[i].harvestBlocks){
    harvestBlockLookup[harvestBlock] = i;
  }
}

namespace CropData {
  /**
   * Finds the slot which contains the best tool to harvest the block
   * @param block The block
   * @param bot The bot
   * @returns The slot number, or -1 if the block should be mined barehand
   */
  export function findBestTool(block: Block, bot: Bot): number {
    // does this block represent a crop?
    if(!CropData.isCrop(block)){
      return -1;
    }
    // if the tool does not matter, then mine barehand
    var rateHarvestTool = crops[harvestBlockLookup[block.name]].rateHarvestTool;
    if(!rateHarvestTool){
      return -1;
    }
    // some initial variables
    var bestSlot = -1;
    var bestScore = 0;
    // iterate over each inventory slot
    for(let slot = bot.inventory.inventoryStart; slot < bot.inventory.inventoryEnd; ++slot){
      // does the item exist?
      if(!bot.inventory.slots[slot]){
        continue;
      }
      // is this a tool?
      var tool = bot.gameData.toTool(bot.inventory.slots[slot]!);
      if(!tool){
        continue;
      }
      // grade the tool
      let score = rateHarvestTool(tool);
      // is it better than the previous best
      if(score > bestScore){
        // replace best score and slot
        bestSlot = slot;
        bestScore = score;
        // Infinity is the best score possible. we don't need to go further
        if(score == Infinity){
          return bestSlot;
        }
      }
    }
    // return the best slot
    return bestSlot;
  }

  /**
   * Finds the best tools from the bot's inventory
   * @param bot The bot
   */
  export function findBestTools(bot: Bot): Map<string, number> {
    // ret value
    var bestTools: Map<string, number> = new Map();
    // iterate over each crop
    for(let i = 0; i < crops.length; ++i){
      // vars
      let crop = crops[i];
      let bestSlot = -1;
      let bestScore = 0;
      // if the tool doesn't matter, then skip this whole process
      if(!crop.rateHarvestTool){
        continue;
      }
      // iterate over every slot in the bot's inventory
      for(let slot = bot.inventory.inventoryStart; slot < bot.inventory.inventoryEnd; ++slot){
        // if it's blank...
        if(!bot.inventory.slots[slot]){
          continue;
        }
        // if the item is not a tool...
        let tool = bot.gameData.toTool(bot.inventory.slots[slot]!);
        if(!tool){
          continue;
        }
        // grade the tool
        let score = crop.rateHarvestTool(tool);
        // is it better than the previous best
        if(score > bestScore){
          // replace best score and slot
          bestSlot = slot;
          bestScore = score;
          // Infinity is the best score possible. we don't need to go further
          if(score == Infinity){
            break;
          }
        }
      }
      // add to bestTools
      for(let harvestBlock of crop.harvestBlocks){
        bestTools.set(harvestBlock, bestSlot);
      }
    }
    // return the best tools
    return bestTools;
  }

  /**
   * Finds the best tools from both the inventory and the bot's personal storage
   * @param bot The bot
   * @returns A map linking the name of the crop block to the chest ID and slot number where a better tool can be found
   */
  export function findBetterTools(bot: Bot): Map<string, {key: string, tool: Tool}> {
    // ret value
    var map: Map<string, {key: string, tool: Tool}> = new Map();
    // iterate over each crop
    for(let i = 0; i < crops.length; ++i){
      // vars
      let crop = crops[i];
      let maxScore = 0;
      // if the tool doesn't matter, then skip this whole process
      if(!crop.rateHarvestTool){
        continue;
      }
      // iterate over every slot in the bot's inventory
      for(let slot = bot.inventory.inventoryStart; slot < bot.inventory.inventoryEnd; ++slot){
        // if it's blank...
        if(!bot.inventory.slots[slot]){
          continue;
        }
        // if the item is not a tool...
        let tool = bot.gameData.toTool(bot.inventory.slots[slot]!);
        if(!tool){
          continue;
        }
        // grade the tool
        let score = crop.rateHarvestTool(tool);
        // is it better than the previous best
        if(score > maxScore){
          // replace best score
          maxScore = score;
          // Infinity is the best score possible. we don't need to go further
          if(score == Infinity){
            break;
          }
        }
      }
      // continue if the best score is Infinity
      if(maxScore === Infinity){
        continue;
      }
      // best key and tool
      let bestKey: string | undefined;
      let bestTool: Tool | undefined;
      // if not, let's see if we can find better
      bot.personalStorage.forEachTool(function(key, tool){
        // grade the tool
        var score = crop.rateHarvestTool!(tool);
        // is it better than the previous best
        if(score > maxScore){
          // replace best key, tool, and score
          bestKey = key;
          bestTool = tool;
          maxScore = score;
          // Infinity is the best score possible. we don't need to go further
          if(score == Infinity){
            return false;
          }
        }
      });
      // did we find better?
      if(bestKey !== undefined){
        for(let harvestBlock of crop.harvestBlocks){
          map.set(harvestBlock, {key: bestKey, tool: bestTool!});
        }
      }
    }
    // return the results
    return map;
  }

  /**
   * Returns the name of the item required to replant a crop
   * @param block The block
   * @returns The name, or undefined if the block isn't a crop or the crop does not need to be replanted
   */
  export function getReplantItem(block: Block): string | undefined {
    if(!harvestBlockLookup[block.name]){
      return;
    }
    var crop = crops[harvestBlockLookup[block.name]];
    if(!crop.replant){
      return;
    }
    return crop.seed;
  }
  /**
   * Returns true if the block given is a crop
   * @param block The block
   * @returns Whether or not the block is a crop
   */
  export function isCrop(block: Block): boolean {
    return harvestBlockLookup[block.name] !== undefined;
  }
  /**
   * Returns true if the block is a harvestable crop
   * @param block The block
   * @param world The world
   * @returns Whether or not the block can be harvested
   */
  export function isHarvestable(block: Block, world: world.WorldSync): boolean {
    return harvestBlockLookup[block.name] !== undefined && crops[harvestBlockLookup[block.name]].canHarvest(block, world);
  }
};

export default CropData;