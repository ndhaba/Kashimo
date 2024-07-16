import mineflayer from "mineflayer";
import Logger from "../utils/Logger";

import { Vec3 } from "vec3";

import * as crops from "../farming/CropData";

const COLLECT_DELAY = 500;

/**
 * Returns a promise that resolves after a given time elapses
 * @param ms The number of milliseconds
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
    // try to mine the block without moving
    var mineResult = await bot.mine(position, false);
    // if it's unreachable
    if(mineResult == "unreachable"){
      // collect all of the block drops
      await bot.collectBlockDrops();
      // try to mine again
      mineResult = await bot.mine(position);
      if(mineResult == "unreachable"){
        // FIXME if the crop is unreachable, the bot will be stuck trying to reach it
        return false;
      }
    }
    // we only need to replant in-place crops
    if(!crops.plants[mineResult.name] || crops.plants[mineResult.name]!.growth !== crops.GrowthType.InPlace){
      return true;
    }
    // vars
    var crop = crops.plants[mineResult.name]!;
    var below = position.offset(0, -1, 0);
    var replantItem = bot.mcdata.itemsByName[crop.seed].id;
    // if the seed is in our inventory...
    if(bot.inventory.findInventoryItem(replantItem, null, false)){
      // equip and place
      await bot.equip(replantItem, "hand");
      await bot.lookAt(below);
      await bot.placeBlock(bot.blockAt(below)!, new Vec3(0, 1, 0));
    // otherwise
    }else{
      // TODO only try to collect the seed item instead of everything
      await sleep(COLLECT_DELAY);
      await bot.collectBlockDrops();
      // if we now have the seed in our inventory...
      if(bot.inventory.findInventoryItem(replantItem, null, false)){
        // equip and place
        await bot.equip(replantItem, "hand");
        await bot.lookAt(below);
        await bot.placeBlock(bot.blockAt(below)!, new Vec3(0, 1, 0));
      // otherwise, there's nothing we can do...
      }else{
        Logger.Warn("Failed to replant", typeof crop.products == "string" ? crop.products : crop.products[0], position.toString());
      }
    }
    // success?
    return true;
  };
}

declare module "mineflayer" {
  interface Bot {
    /**
     * Harvests a crop
     * @returns Whether or not the harvesting was successful
     */
    harvestCrop(position: Vec3): Promise<boolean>;
  }
}