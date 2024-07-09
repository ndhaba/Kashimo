import {Bot, Chest} from "mineflayer";
import {Item} from "prismarine-item";
import {Block} from "prismarine-block";
import {Task, Action, sleep} from "../core/task";
import {Vec3} from "vec3";

import CropData from "./cropdata";
import { goals, pathfinder } from "mineflayer-pathfinder";
import { Tool } from "../core/gamedata";
import logger from "../core/logger";

export default class FarmTask implements Task {
  name: string = "farm";

  private bot: Bot;
  private harvestables: Map<string, Vec3> = new Map();
  private growing: Map<string, Vec3> = new Map();

  /**
   * Initializes a new farming task
   * @param bot The bot
   */
  constructor(bot: Bot){
    this.bot = bot;
    this.bot.on("blockUpdate", this.onBlockUpdate.bind(this));
  }

  onBlockUpdate(oldBlock: Block | null, newBlock: Block): void {
    // is the new block a crop?
    if(CropData.isCrop(newBlock)){
      let key = newBlock.position.toString();
      // is the new crop harvestable?
      if(CropData.isHarvestable(newBlock, this.bot.world)){
        // remove from growing
        if(this.growing.has(key)){
          this.growing.delete(key);
        }
        // add to harvestables
        if(!this.harvestables.has(key)){
          this.harvestables.set(key, newBlock.position);
        }
      // otherwise, add to growing
      }else if(!this.growing.has(key)){
        this.growing.set(key, newBlock.position);
      }
    // was the old block a crop?
    }else if(oldBlock && CropData.isCrop(oldBlock)){
      let key = oldBlock.position.toString();
      // remove from harvestables
      if(this.harvestables.has(key)){
        this.harvestables.delete(key);
      }
      // remove from growing
      if(this.growing.has(key)){
        this.growing.delete(key);
      }
    }
  }

  *start() {
    // idle a lil bit if there's no crops
    if(this.harvestables.size == 0){
      yield sleep(1000);
      return;
    }
    // manage inventory
    yield* this.manageInventory();
    // while there are crops to harvest...
    while(this.harvestables.size > 0){
      // go to any crop
      yield this.walkToCrop();
      // iterate over every harvestable crop
      for(let [key, vec] of this.harvestables){
        let block = this.bot.blockAt(vec);
        // if we can see and mine it...
        if(block && this.bot.canDigBlock(block) && this.bot.canSeeBlock(block)){
          // ... pick the best tool
          yield this.equip(CropData.findBestTool(block, this.bot));
          // ... then mine it
          yield this.dig(block);
        }
      }
      // if there's not enough inventory space
      if(this.bot.inventory.emptySlotCount() == 0){
        break;
      }
    }
  }
  
  /**
   * Digs the given block
   * @param block The block
   * @returns An interruptable action
   */
  private dig(block: Block): Action {
    return Action.from(this.bot.dig(block, false), () => this.bot.stopDigging());
  }

  /**
   * Equips the item from the given slot
   * @param slot The slot
   * @returns An interruptable action
   */
  private equip(slot: number): Action {
    // barehand?
    if(slot == -1){
      // do we have any empty slots?
      if(this.bot.inventory.emptySlotCount() != 0){
        slot = this.bot.inventory.firstEmptyInventorySlot(true)!;
      }
      // find a non-tool, or use the first inventory slot as a last resort
      slot = this.bot.inventory.inventoryStart;
      for(let s = this.bot.inventory.inventoryStart; s < this.bot.inventory.inventoryEnd; ++s){
        if(!this.bot.gameData.toTool(this.bot.inventory.slots[s]!)){
          slot = s;
        }
      }
    }
    // return the action
    return Action.from(this.bot.equip(slot, "hand"));
  }

  /**
   * Manages the inventory, depositing and withdrawing items when needed
   */
  private *manageInventory(){
    // check all uncached chests
    var uncached = this.bot.personalStorage.getUncached();
    while(uncached.length != 0){
      // go to one of the chests
      let goal = this.bot.personalStorage.createGoal(uncached);
      yield Action.from(this.bot.pathfinder.goto(goal), () => this.bot.pathfinder.setGoal(null));
      // get all of the reachable chests
      let reachable = this.bot.personalStorage.filterReachable(uncached, true);
      // open each one and cache it
      for(let chest of reachable){
        // this will be replaced with the actual container
        let container: Chest = null as unknown as Chest;
        // open the chest
        yield new Action((resolve, reject) => {
          this.bot.openChest(this.bot.blockAt(chest)!).then(v => {
            container = v;
            console.log("container received");
            resolve();
          }).catch(reject);
        });
        // cache the contents
        this.bot.personalStorage.cache(chest.toString(), container);
        // close the chest
        this.bot.closeWindow(container);
      }
    }
    // we need to protect the slots of tools we need
    var protectedSlots: Set<number> = new Set();
    var withdrawalLocations: Map<string, Tool[]> = new Map();
    // find the best tools
    var bestTools = CropData.findBestTools(this.bot);
    var betterTools = CropData.findBetterTools(this.bot);
    // iterate over each best tool in inventory
    for(let [harvestBlock, num] of bestTools){
      // protect the slot if it's the best tool
      if(num != -1 && !betterTools.has(harvestBlock)){
        protectedSlots.add(num);
      }
    }
    // iterate over each better tool in storage
    for(let [harvestBlock, location] of betterTools){
      // make the array if it's not there
      if(!withdrawalLocations.has(location.key)){
        withdrawalLocations.set(location.key, [location.tool]);
        continue;
      }
      // add if the tool isn't already there
      let locs = withdrawalLocations.get(location.key)!;
      if(locs.indexOf(location.tool) === -1){
        locs.push(location.tool);
      }
    }
    // do we need to go to any chests?
    if(withdrawalLocations.size != 0){
      let locations = Array.from(withdrawalLocations.keys());
      // go to each location
      while(locations.length != 0){
        // go to one of the chests
        let goal = this.bot.personalStorage.createGoal(locations);
        yield Action.from(this.bot.pathfinder.goto(goal), () => this.bot.pathfinder.setGoal(null));
        // get all of the reachable chests
        let reachable = this.bot.personalStorage.filterReachable(locations, true);
        // open each one and cache it
        for(let chest of reachable){
          // this will be replaced with the actual container
          let container: Chest = null as unknown as Chest;
          // open the chest
          yield new Action((resolve, reject) => {
            this.bot.openChest(this.bot.blockAt(chest)!).then(v => {
              container = v;
              console.log("container received");
              resolve();
            }).catch(reject);
          });
          // deposit
          for(let slot = container.inventoryStart; slot < container.inventoryEnd; ++slot){
            if(protectedSlots.has(slot)){
              continue;
            }
            if(!container.slots[slot]){
              continue;
            }
            let containerSlot = container.firstEmptyContainerSlot();
            // one day, we'll be able to swap items
            if(typeof containerSlot != "number"){
              break;
            }
            // deposit
            container.updateSlot(containerSlot, container.slots[slot]!);
          }
          // withdraw
          let tools = withdrawalLocations.get(chest.toString())!;
          for(let tool of tools){
            let invSlot = container.firstEmptyInventorySlot(false);
            if(typeof invSlot !== "number"){
              continue;
            }
            if(!container.slots[tool.slot]){
              continue;
            }
            container.updateSlot(invSlot, container.slots[tool.slot]!);
          }
          this.bot.personalStorage.cache(chest.toString(), container);
          // close the chest
          this.bot.closeWindow(container);
        }
      }
    }
  }

  /**
   * Walks to any of the grown crops
   * @returns An interruptable action
   */
  private walkToCrop(): Action {
    var firstCrop: [string, Vec3] = this.harvestables.entries().next().value;
    return Action.from(this.bot.pathfinder.goto(new goals.GoalLookAtBlock(firstCrop[1], this.bot.world)), () => this.bot.pathfinder.setGoal(null));
  }
}