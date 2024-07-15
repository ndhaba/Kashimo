import mineflayer from "mineflayer";

import { Block } from "prismarine-block";
import { Entity } from "prismarine-entity";
import { goals } from "mineflayer-pathfinder";
import { Vec3 } from "vec3";

const ITEM_DROP_WINDOW = 200;
const MAX_ITEM_PICKUP_DISTANCE = 0.4;
const ITEM_PICKUP_WINDOW = 750;

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
 * Attempts to move into view of the given position
 * @param bot The bot
 * @param position The position
 * @returns A boolean representing the success/failure of the procedure
 */
async function moveTo(bot: mineflayer.Bot, position: Vec3): Promise<boolean> {
  try {
    await bot.pathfinder.goto(new goals.GoalNear(position.x, position.y, position.z, 1));
    return true;
  }catch(err){
    return false;
  }
}

/**
 * Sets up advanced digging methods for the bot
 * @param bot The bot
 */
export default function digger(bot: mineflayer.Bot){
  // initial variables
  var brokenBlocks: Set<string> = new Set();
  var droppedItems: Map<number, Entity> = new Map();

  // entity spawn
  bot.on("entitySpawn", function(entity){
    if(entity.entityType != 54){
      return;
    }
    var pos = entity.position;
    var blockPos = new Vec3(Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z));
    if(brokenBlocks.has(blockPos.toString())){
      droppedItems.set(entity.id, entity);
    }
  });
  
  // entity despawn
  bot.on("entityGone", function(entity){
    if(entity.entityType != 54){
      return;
    }
    if(droppedItems.has(entity.id)){
      droppedItems.delete(entity.id);
    }
  });

  // collect drops :3
  bot.collectBlockDrops = async function(){
    // check if any drops are in range, then wait to pick them up
    while(droppedItems.size != 0){
      for(let [id, entity] of droppedItems){
        if(entity.position.distanceTo(bot.entity.position) < MAX_ITEM_PICKUP_DISTANCE){
          await sleep(ITEM_PICKUP_WINDOW);
          continue;
        }
      }
      // if they aren't in range, then move to the first entity in the set (random)
      let entity: Entity = droppedItems.values().next().value;
      // try to move directly onto the item
      try {
        await bot.pathfinder.goto(new goals.GoalBlock(entity.position.x, entity.position.y, entity.position.z));
      }catch(err){
        if(!entity || !entity.position){
          droppedItems.delete(entity.id);
        }
      }
    }
  };

  bot.getBlockDropCount = function(){
    return droppedItems.size;
  }

  // mine :3
  bot.mine = async function(position, move = true){
    // if the bot is allowed to move...
    if(move){
      // if we can't load the block then we are already too far away
      var block = bot.blockAt(position);
      if(block === null){
        if(!(await moveTo(bot, position))){
          return "unreachable"
        }
        block = bot.blockAt(position)!;
      }
      // make sure the block is visible
      if((!bot.canSeeBlock(block) || !bot.canDigBlock(block)) && !(await moveTo(bot, position))){
        return "unreachable";
      }
    // if the bot is not allowed to move...
    }else{
      // if we can't get the block, there's nothing we can do
      var block = bot.blockAt(position);
      if(!block || !bot.canSeeBlock(block) || !bot.canDigBlock(block)) return "unreachable";
    }
    // move the bot's camera and break the block
    const pos = block.position.toString();
    await bot.lookAt(position, true);
    brokenBlocks.add(pos);
    await bot.dig(block!);
    // remove
    setTimeout(function(){
      brokenBlocks.delete(pos);
    }, ITEM_DROP_WINDOW);
    // return the block we just broke
    return block;
  };
}

declare module "mineflayer" {
  interface Bot {
    /**
     * Collects the drops from blocks you have recently broken
     */
    collectBlockDrops(): Promise<void>;
    /**
     * Gets the number of block drops
     */
    getBlockDropCount(): number;
    /**
     * Moves into view of a block, looks at it, then breaks the block.
     * @param position The position of the block
     */
    mine(position: Vec3, move?: boolean): Promise<Block | "unreachable">;
  }
}