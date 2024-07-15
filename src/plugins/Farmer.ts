import mineflayer from "mineflayer";
import Logger from "../utils/Logger";

import { Vec3 } from "vec3";

import * as crops from "../farming/CropData";

const COLLECT_DELAY = 500;

/**
 * Returns a promise that resolves after a given time elapses
 * @param ms The number of milliseconds
 * @returns 
 */
function sleep(ms: number){
  return new Promise<void>(function(resolve, reject){
    setTimeout(() => resolve(), ms);
  });
}

/**
 * Sets up advanced digging methods for the bot
 * @param bot The bot
 */
export default function farmer(bot: mineflayer.Bot){
  // harvest :3
  bot.harvestCrop = async function(position){
    var mineResult = await bot.mine(position, false);
    if(mineResult == "unreachable"){
      await bot.collectBlockDrops();
      mineResult = await bot.mine(position);
      if(mineResult == "unreachable"){
        return false; // FIXME if the crop is unreachable, the bot will be stuck trying to reach it
      }
    }
    if(!crops.plants[mineResult.name] || crops.plants[mineResult.name].growth !== crops.GrowthType.InPlace){
      return true;
    }
    var crop = crops.plants[mineResult.name];
    var below = position.offset(0, -1, 0);
    var replantItem = bot.mcdata.itemsByName[crop.seed].id;
    if(bot.inventory.findInventoryItem(replantItem, null, false)){
      await bot.equip(replantItem, "hand");
      await bot.lookAt(below);
      await bot.placeBlock(bot.blockAt(below)!, new Vec3(0, 1, 0));
    }else{
      await sleep(COLLECT_DELAY);
      await bot.collectBlockDrops();
      if(bot.inventory.findInventoryItem(replantItem, null, false)){
        await bot.equip(replantItem, "hand");
        await bot.lookAt(below);
        await bot.placeBlock(bot.blockAt(below)!, new Vec3(0, 1, 0));
      }else{
        Logger.Warn("Failed to replant", typeof crop.products == "string" ? crop.products : crop.products[0], position.toString());
      }
    }
    return true;
  };
}

declare module "mineflayer" {
  interface Bot {
    /**
     * Harvests a crop
     */
    harvestCrop(position: Vec3): Promise<boolean>;
  }
}