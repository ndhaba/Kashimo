import { Block } from "prismarine-block";
import { Bot } from "mineflayer";
import { Entity } from "prismarine-entity";
import { EventEmitter } from "events";
import { goals } from "mineflayer-pathfinder";
import { Vec3 } from "vec3";

import Logger from "../utils/Logger";

import * as crops from "../farming/CropData";

const ITEM_DROP_WINDOW = 200;
const MAX_ITEM_DESPAWN_WAIT = 2000;
const MAX_ITEM_PICKUP_DISTANCE = 0.4;

/**
 * Returns a promise that resolves after a given time elapses
 * @param ms The number of milliseconds
 */
function sleep(ms: number){
  return new Promise<undefined>(function(resolve, reject){
    setTimeout(() => resolve(undefined), ms);
  });
}

export default class Harvester {
  private brokenBlocks: Set<string> = new Set();
  private emitter: EventEmitter = new EventEmitter();
  private entities: Map<number, Entity> = new Map();

  /**
   * Constructs a harvester, which exposes methods for movement, mining blocks, and collecting item drops
   * @param bot The bot
   */
  constructor(private bot: Bot){
    bot.on("entitySpawn", this.onEntitySpawn.bind(this));
    bot.on("entityGone", this.onEntityDespawn.bind(this));
    bot.on("itemDrop", this.onItemDrop.bind(this));
  }

  /**
   * Attempts to collect all block drops
   */
  async collectAllDrops(): Promise<void> {
    // loop over block drops
    while(this.entities.size != 0){
      let earlyBreak = false;
      // true or false
      for(let condition = 0; condition <= 1; ++condition){
        // loop over entities
        for(let [id, entity] of this.entities){
          // is the entity close enough (first iteration)
          if(!condition && entity.position.distanceTo(this.bot.entity.position) > MAX_ITEM_PICKUP_DISTANCE){
            continue;
          }
          // move to the item (second iteration)
          if(condition == 1){
            try {
              await this.bot.pathfinder.goto(new goals.GoalBlock(entity.position.x, entity.position.y, entity.position.z));
            }catch(err){
              continue;
            }
          }
          // make sure there's space for the item
          await this.waitForDropMeta(id);
          let item = entity.getDroppedItem()!;
          if(this.bot.inv.getRemainingSpace(item.type) < item.count){
            Logger.Error("Harvester.collectAllDrops(): Not enough space for item");
            return;
          }
          // wait for the item to be collected
          await this.waitForDropCollect(id);
          earlyBreak = true;
          break;
        }
        if(earlyBreak){
          break;
        }
      }
    }
  }

  /**
   * Attempts to collect a certain amount of the given item
   * @param item The item's name or ID
   * @param minimum The minimum number of items to collect
   * @returns The number of items to collect (not guaranteed to reach minimum)
   */
  async collectItem(item: string | number, minimum: number): Promise<number> {
    // the minimum number of the item we need to exit
    let requirement = this.bot.inv.count(item) + minimum;
    // loop over block drops
    while(this.entities.size != 0 && requirement > this.bot.inv.count(item)){
      let earlyBreak = false;
      // true or false
      for(let condition = 0; condition <= 1; ++condition){
        // loop over entities
        for(let [id, entity] of this.entities){
          // is the entity close enough (first iteration)
          if(!condition && entity.position.distanceTo(this.bot.entity.position) > MAX_ITEM_PICKUP_DISTANCE){
            continue;
          }
          // is the item the right ID?
          await this.waitForDropMeta(id);
          let itemStack = entity.getDroppedItem()!;
          if(itemStack.type != item){
            continue;
          }
          // do we have space?
          if(this.bot.inv.getRemainingSpace(item) == 0){
            Logger.Error(`Harvester.collectItem(): Not enough space for item`);
            return this.bot.inv.count(item) - requirement + minimum;
          }
          // move to the item (second iteration)
          if(condition == 1){
            try {
              await this.bot.pathfinder.goto(new goals.GoalBlock(entity.position.x, entity.position.y, entity.position.z));
            }catch(err){
              continue;
            }
          }
          // wait for the item to be collected
          if(false === await this.waitForDropCollect(id)){
            Logger.Error(`Harvester.collectItem(): Failed to collect stack after ${MAX_ITEM_DESPAWN_WAIT}ms`);
            return this.bot.inv.count(item) - requirement + minimum;
          }
          earlyBreak = true;
          break;
        }
        if(earlyBreak){
          break;
        }
      }
      if(earlyBreak){
        continue;
      }
      // if we can't find this item, then there's nothing we can do
      break;
    }
    // return the number of items the bot has collected
    return this.bot.inv.count(item) - requirement + minimum;
  }

  /**
   * Gets the number of block drops
   */
  getBlockDropCount(){
    return this.entities.size;
  }

  /**
   * Harvests a block
   * @param position The block's position
   */
  async harvest(position: Vec3){
    // try to mine the block without moving
    var mineResult = await this.mine(position, false);
    // if it's unreachable
    if(!mineResult){
      // collect all of the block drops
      await this.collectAllDrops();
      // try to mine again
      mineResult = await this.mine(position);
      if(!mineResult){
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
    var replantItem = this.bot.mcdata.itemsByName[crop.seed].id;
    // if the seed is in our inventory, or if we were able to collect it...
    if(this.bot.inventory.findInventoryItem(replantItem, null, false) || 1 <= await this.collectItem(replantItem, 1)){
      // equip and place
      await this.bot.equip(replantItem, "hand");
      await this.bot.lookAt(below);
      await this.bot.placeBlock(this.bot.blockAt(below)!, new Vec3(0, 1, 0));
    // otherwise...
    }else{
      Logger.Warn("Failed to replant", typeof crop.products == "string" ? crop.products : crop.products[0], position.toString());
    }
    // success?
    return true;
  }

  /**
   * Moves into view of a block, looks at it, then breaks the block
   * @param position The block's position
   * @param move Whether or not the bot may move
   * @returns The block broken, or undefined if the procedure failed
   */
  async mine(position: Vec3, move: boolean = true): Promise<Block | undefined> {
    // if the bot is allowed to move...
    if(move){
      // if we can't load the block then we are already too far away
      var block = this.bot.blockAt(position);
      if(block === null){
        if(!(await this.moveTo(position))){
          return;
        }
        block = this.bot.blockAt(position)!;
      }
      // make sure the block is visible
      if((!this.bot.canSeeBlock(block) || !this.bot.canDigBlock(block)) && !(await this.moveTo(position))){
        return;
      }
    // if the bot is not allowed to move...
    }else{
      // if we can't get the block, there's nothing we can do
      var block = this.bot.blockAt(position);
      if(!block || !this.bot.canSeeBlock(block) || !this.bot.canDigBlock(block)) return;
    }
    // move the bot's camera and break the block
    const pos = block.position.toString();
    await this.bot.lookAt(position, true);
    this.brokenBlocks.add(pos);
    await this.bot.dig(block!);
    // remove
    setTimeout(() => {
      this.brokenBlocks.delete(pos);
    }, ITEM_DROP_WINDOW);
    // return the block we just broke
    return block;
  }

  /**
   * Waits for a block drop to be collected
   * @param id The ID of the entity
   */
  waitForDropCollect(id: number): Promise<boolean> {
    if(!this.entities.has(id)){
      return Promise.resolve(true);
    }
    let eventName = "despawn:" + id;
    return new Promise(resolve => {
      // true = success, false = fail
      let resolver = () => resolve(true);
      // remove listener and fail if max time is passed
      setTimeout(() => {
        this.emitter.removeListener(eventName, resolver);
        resolve(false);
      }, MAX_ITEM_DESPAWN_WAIT);
      // wait for event
      this.emitter.once(eventName, resolver);
    });
  }

  /**
   * Attempts to move into view of the given position
   * @param position The position
   * @returns A boolean representing the success/failure of the procedure
   */
  private async moveTo(position: Vec3): Promise<boolean> {
    try {
      await this.bot.pathfinder.goto(new goals.GoalNear(position.x, position.y, position.z, 1));
      return true;
    }catch(err){
      return false;
    }
  }

  /**
   * Waits for metadata for a block drop
   * @param id The ID of the entity
   */
  private waitForDropMeta(id: number): Promise<void> {
    if(!this.entities.has(id)){
      return Promise.resolve();
    }
    if(this.entities.get(id)!.metadata.length != 0){
      return Promise.resolve();
    }
    return new Promise(resolve => {
      this.emitter.once("metadata:" + id, () => {
        resolve();
      });
    });
  }

  /**
   * Event handler for entity spawn events
   * @param entity The entity
   */
  private onEntitySpawn(entity: Entity){
    if(entity.entityType != 54){
      return;
    }
    var key = entity.position.floored().toString();
    if(this.brokenBlocks.has(key)){
      this.entities.set(entity.id, entity);
    }
  }

  /**
   * Event handler for entity despawn events
   * @param entity The entity
   */
  private onEntityDespawn(entity: Entity){
    if(entity.entityType != 54){
      return;
    }
    if(this.entities.has(entity.id)){
      this.entities.delete(entity.id);
      this.emitter.emit("despawn:" + entity.id);
    }
  }

  /**
   * Event handler for item drop events (for metadata)
   * @param entity 
   */
  private onItemDrop(entity: Entity){
    if(entity.entityType != 54){
      return;
    }
    let item = entity.getDroppedItem()!;
    if(this.entities.has(entity.id)){
      this.emitter.emit("metadata:" + entity.id);
    }
  }
};

declare module "mineflayer" {
  interface Bot {
    harvest: Harvester
  }
}