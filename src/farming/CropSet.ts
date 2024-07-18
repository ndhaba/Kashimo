import Crop from "./Crop";
import Logger from "../utils/Logger";

import blockLoader, { Block } from "prismarine-block";
import { Bot } from "mineflayer";
import { Vec3 } from "vec3";

import * as crops from "./CropData";

export default class CropSet {
  private bot: Bot;
  private blocks: Map<string, Crop>;
  private harvestable: Map<string, Vec3>;
  readonly position: Vec3;
  public scanned: boolean;

  private _Block: typeof Block;

  /**
   * Constructs a Crop set
   * @param bot The bot
   */
  constructor(bot: Bot, position: Vec3){
    this.bot = bot;
    this.blocks = new Map();
    this.harvestable = new Map();
    this.position = position;
    this.scanned = false;

    this._Block = blockLoader(this.bot.registry);
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
   * Returns every harvestable vector, in order of proximity to the player
   */
  nearest(): Vec3[] {
    if(this.harvestable.size == 0){
      return [];
    }
    var vectors: Vec3[] = [];
    var distances: number[] = [];
    for(let vec of this.harvestable.values()){
      let low = 0;
      let dist = vec.distanceTo(this.bot.entity.position);
      let high = vectors.length - 1;
      while(low < high){
        let mid = Math.floor((low + high) / 2);
        if(dist < distances[mid]){
          high = mid;
        }else if(dist > distances[mid]){
          low = mid + 1;
        }else{
          low = high = mid;
        }
      }
      vectors.splice(low, 0, vec);
      distances.splice(low, 0, dist);
    }
    return vectors;
  }

  /**
   * Scans the entire chunk
   */
  scan(){
    // do not do redundant scans
    if(this.scanned){
      return;
    }
    // check if the chunk palette contains a crop block (faster than checking all 4,096 blocks)
    var column: any = this.bot.world.getColumn(this.position.x, this.position.z);
    if(!column){
      return;
    }
    var chunk: any = column.sections[this.position.y + Math.abs((this.bot.game as any).minY >> 4)];
    if(!chunk){
      return;
    }
    var hasCrop = false;
    for(let paletteEntry of chunk.palette){
      if(crops.plants[this._Block.fromStateId(paletteEntry, 0).name]){
        hasCrop = true;
        break;
      }
    }
    this.scanned = true;
    if(!hasCrop){
      return;
    }
    // check all 4,096 blocks
    for(let x = this.position.x * 16; x < this.position.x * 16 + 16; ++x){
      for(let y = this.position.y * 16; y < this.position.y * 16 + 16; ++y){
        for(let z = this.position.z * 16; z < this.position.z * 16 + 16; ++z){
          let block = this.bot.blockAt(new Vec3(x, y, z), false)!;
          let data = crops.plants[block.name];
          if(data === undefined){
            continue;
          }
          let key = block.position.toString();
          if(this.blocks.has(key) || this.harvestable.has(key)){
            continue;
          }
          if(data.growth == crops.GrowthType.Stalk){
            let b2 = this.bot.blockAt(new Vec3(x, y - 2, z));
            if(b2 !== null && crops.plants[b2.name] === data){
              continue;
            }
            let b1 = this.bot.blockAt(new Vec3(x, y - 1, z));
            if(b1 !== null && crops.plants[b1.name] === data){
              this.update(null, block, data);
            }else{
              this.add(block, data);
            }
          }else{
            this.update(null, block, data);
          }
        }
      }
    }
    // scan done!
    this.scanned = true;
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