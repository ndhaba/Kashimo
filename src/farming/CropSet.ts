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
   * Adds a crop
   * @param block The block
   * @param data The associated crop data
   */
  add(block: Block, data: crops.Data){
    var key = block.position.toString();
    // create the crop object if it doesn't exist
    if(!this.blocks.has(key)){
      this.blocks.set(key, new Crop(block.position, data));
    }
    // update the crop and get the result
    var result = this.blocks.get(key)!.update(null, block);
    if(result instanceof Vec3){
      this.harvestable.set(result.toString(), result);
    }
  }

  /**
   * Clears the set
   */
  clear(): void {
    this.blocks.clear();
    this.harvestable.clear();
  }

  /**
   * Checks if the block or position is marked as harvestable
   * @param block The block or position vector
   */
  canHarvest(block: Block | Vec3): boolean {
    if("name" in block){
      block = block.position;
    }
    return this.harvestable.has(block.toString());
  }

  /**
   * Deletes a block
   * @param block The block
   */
  delete(block: Block){
    // get the key
    var key = block.position.toString();
    // remove from harvestable and blocks
    this.blocks.delete(key);
    this.harvestable.delete(key);
  }

  /**
   * Checks if the block or position is stored as a crop
   * @param block The block, or block position
   * @returns True or false
   */
  has(block: Block | Vec3): boolean {
    if("name" in block){
      block = block.position;
    }
    return this.blocks.has(block.toString());
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
   * Updates a crop with the given block
   * @param block The block
   * @param data The associated crop data
   */
  update(oldBlock: Block | null, newBlock: Block, data: crops.Data){
    switch(data.growth){
      // if this is a in-place crop or stem...
      case crops.GrowthType.InPlace:
      case crops.GrowthType.Stem: {
        let key = newBlock.position.toString();
        // create the crop object if it doesn't exist
        if(!this.blocks.has(key)){
          this.blocks.set(key, new Crop(newBlock.position, data));
        }
        // update the crop and get the result
        var result = this.blocks.get(key)!.update(oldBlock, newBlock);
        if(result instanceof Vec3){
          this.harvestable.set(result.toString(), result);
        }
        return;
      }
      // if this is a stalk crop...
      case crops.GrowthType.Stalk: {
        // remove from harvestable first
        this.harvestable.delete(newBlock.position.toString());
        // get the position and key of the origin block
        let pos = newBlock.position.offset(0, -1, 0);
        let key = pos.toString();
        // create the crop if it doesn't exist
        if(!this.blocks.has(key)){
          this.blocks.set(key, new Crop(pos, data));
        }
        // update the crop and get the result
        var result = this.blocks.get(key)!.update(oldBlock, newBlock);
        if(result instanceof Vec3){
          this.harvestable.set(result.toString(), result);
        }
        return;
      }
    }
  }
}