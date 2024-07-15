import Crop from "./Crop";

import { Block } from "prismarine-block";
import { Bot } from "mineflayer";
import { Vec3 } from "vec3";

import * as crops from "./CropData";

export default class CropSet {
  private bot: Bot;
  private blocks: Map<string, Crop>;
  private harvestable: Map<string, Vec3>;

  /**
   * Constructs a Crop set
   * @param bot The bot
   */
  constructor(bot: Bot){
    this.bot = bot;
    this.blocks = new Map();
    this.harvestable = new Map();
  }

  /**
   * The number of crops stored
   */
  get size(): number {
    return this.blocks.size;
  }

  /**
   * Clears the set
   */
  clear(): void {
    this.blocks.clear();
    this.harvestable.clear();
  }

  /**
   * Checks if the block or position is stored as a crop or harvestable
   * @param block The block, or block position
   * @returns True or false
   */
  has(block: Block | Vec3): boolean {
    if("name" in block){
      block = block.position;
    }
    return this.blocks.has(block.toString()) || this.harvestable.has(block.toString());
  }

  /**
   * Returns the nearest harvestable block vector, or undefined if there are none
   */
  nearest(): Vec3 | undefined {
    if(this.harvestable.size == 0){
      return;
    }
    let nearest: Vec3 = this.bot.entity.position;
    let distance: number = Infinity;
    for(let [_, vec] of this.harvestable){
      let dist = vec.distanceTo(this.bot.entity.position);
      if(dist < distance){
        nearest = vec;
        distance = dist;
      }
    }
    return nearest;
  }

  /**
   * Attempts to add or update a crop based on this block
   * @param block The block
   * @returns Whether or not a crop was updated
   */
  use(block: Block): boolean {
    // keys are strings
    var poss = block.position.toString();
    // do we have this as an additional block?
    if(this.harvestable.has(poss)){
      if(block.name == "air"){
        this.harvestable.delete(poss);
        let b1 = block.position.offset(0, -1, 0).toString();
        if(this.blocks.get(b1)?.data.growth == crops.GrowthType.Stalk){
          this.blocks.get(b1)!.update(block);
        }
      }
    }
    // do we already have this as a crop?
    if(this.blocks.has(poss)){
      // get the crop and try to update
      let crop = this.blocks.get(poss)!;
      let result = crop.update(block);
      // if it's ready to harvest...
      if(result instanceof Vec3){
        this.harvestable.set(result.toString(), result);
      // if the update failed
      }else if(result === false){
        // if the crop no longer exists...
        if(!crop.exists){
          this.blocks.delete(poss);
          return true;
        }
        // no update
        return false;
      }
      // success!
      return true;
    }
    // is this actually a crop?
    let data: crops.Data;
    if((data = crops.plants[block.name]) === undefined){
      return false;
    }
    // variables for crop
    var crop: Crop;
    var result: Vec3 | boolean;
    // handle crop addition differently depending on type
    switch(data.growth){
      case crops.GrowthType.InPlace:
      case crops.GrowthType.Stem: {
        crop = new Crop(block);
        result = crop.update(block);
        break;
      }

      case crops.GrowthType.Stalk: {
        let b1 = this.bot.blockAt(block.position.offset(0, -1, 0))!;
        if(crops.stalkGround.has(b1.name)){
          crop = new Crop(block);
        }else if(this.blocks.has(b1.position.toString())){
          crop = this.blocks.get(b1.position.toString())!;
        }else{
          crop = new Crop(b1);
        }
        result = crop.update(block);
        break;
      }
    }
    // add crop
    this.blocks.set(crop.position.toString(), crop);
    // if it's ready to harvest...
    if(result instanceof Vec3){
      this.harvestable.set(result.toString(), result);
    }
    // success!
    return true;
  }
}