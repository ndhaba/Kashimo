
import CropSet from "./CropSet";

import { Bot } from "mineflayer";
import { Block } from "prismarine-block";
import { Vec3 } from "vec3";

import * as crops from "./CropData";
import * as ChunkMath from "../utils/ChunkMath";

export default class CropRegistry {
  private bot: Bot;
  private chunks: Map<string, CropSet>;

  /**
   * Constructs a crop registry
   * @param bot The bot
   */
  constructor(bot: Bot){
    this.bot = bot;
    this.chunks = new Map();

    this.bot.on("blockUpdate", this.onBlockUpdate.bind(this));
  }

  /**
   * Returns the vector to the nearest harvestable crop
   */
  nearest(): Vec3 | undefined {
    if(this.chunks.size == 0){
      return;
    }
    var distance: number = Infinity;
    var nearest: Vec3 | undefined;
    var remaining = new Set(this.chunks.keys());
    var radialGenerator = ChunkMath.getRadialChunks(this.bot.entity.position);
    do {
      let nextChunks = radialGenerator.next().value!;
      for(let chunk of nextChunks){
        let key = chunk.toString();
        if(!remaining.has(key)){
          continue;
        }
        remaining.delete(key);
        let n = this.chunks.get(key)!.nearest();
        if(n !== undefined){
          nearest = n;
          distance = n.distanceTo(this.bot.entity.position);
          break;
        }
      }
    }
    while(nearest === undefined && remaining.size > this.chunks.size / 2);
    if(nearest === undefined){
      for(let key of remaining){
        remaining.delete(key);
        let n = this.chunks.get(key)!.nearest();
        if(n !== undefined){
          nearest = n;
          distance = n.distanceTo(this.bot.entity.position);
          break;
        }
      }
      if(nearest === undefined){
        return;
      }
    }

    var additionalChunks = ChunkMath.getAdditionalSearchChunks(this.bot.entity.position, distance);
    for(let chunk of additionalChunks){
      let key = chunk.toString();
      if(!remaining.has(key)){
        continue;
      }
      remaining.delete(key);
      let n = this.chunks.get(key)!.nearest();
      if(n === undefined){
        continue;
      }
      let d = n.distanceTo(this.bot.entity.position);
      if(d < distance){
        nearest = n;
        distance = d;
      }
    }

    return nearest;
  }
  
  /**
   * Event handler for when blocks are updated
   * @param oldBlock The old block
   * @param newBlock The new block
   */
  private onBlockUpdate(oldBlock: Block | null, newBlock: Block){
    // get the old and new block crop data
    var oldData = oldBlock === null ? undefined : crops.plants[oldBlock.name];
    var newData = crops.plants[newBlock.name];
    // if the original block wasn't a crop
    if(oldData === undefined){
      // it might've been a harvest block (stem crops only)
      let oldHarvestData = oldBlock === null ? undefined : crops.harvest[oldBlock.name];
      if(oldHarvestData !== undefined && oldHarvestData !== newData){
        this.onHarvestBlockRemove(oldBlock!, oldHarvestData);
      }
      // if the new block is a crop...
      if(newData !== undefined){
        this.onCropBlockPlace(oldBlock, newBlock, newData);
      }
    }
    // if the new block isn't a crop
    else if(oldData !== newData){
      this.onCropBlockRemove(oldBlock!, newBlock, oldData);
      // if new data exists, then this crop was replaced with another
      if(newData !== undefined){
        this.onCropBlockPlace(oldBlock, newBlock, newData);
      }
    }
    // this was an update
    else{
      this.onCropBlockUpdate(newBlock, newData);
    }
  }

  /**
   * Event handler for when a crop block is placed
   * @param oldBlock The old block
   * @param newBlock The new block
   * @param data The associated crop data
   */
  private onCropBlockPlace(oldBlock: Block | null, newBlock: Block, data: crops.Data){
    // the crop set
    var chunkPos: Vec3 = ChunkMath.getChunkPosition(newBlock.position);
    var chunkSet: CropSet;
    // special procedure for stalk-type crops (sugar cane, bamboo)
    if(data.growth == crops.GrowthType.Stalk){
      let b1 = this.bot.blockAt(newBlock.position.offset(0, -1, 0));
      let b2 = this.bot.blockAt(newBlock.position.offset(0, -2, 0));
      // we only need to know if stalks are 2 blocks tall
      if(b2 === null || crops.plants[b2.name] === data){return}
      // is the block under the same crop?
      else if(b1 !== null && crops.plants[b1.name] === data){
        chunkPos = ChunkMath.getChunkPosition(newBlock.position.offset(0, -1, 0));
        chunkSet = this.getCropSet(chunkPos);
        chunkSet.update(oldBlock, newBlock, data);
      }
      // if not...
      else {
        chunkSet = this.getCropSet(chunkPos);
        chunkSet.add(newBlock, data);
      }
    }
    // for other crops
    else {
      chunkSet = this.getCropSet(chunkPos);
      chunkSet.add(newBlock, data);
    }
    // delete the chunk set if it's empty
    if(chunkSet.size == 0){
      this.chunks.delete(chunkPos.toString());
    }
  }

  /**
   * Event handler for when a crop block is updated
   * @param block The block
   * @param data The associated crop data
   */
  private onCropBlockUpdate(block: Block, data: crops.Data){
    // ignore stalk crop updates
    if(data.growth == crops.GrowthType.Stalk){
      return;
    }
    // the crop set
    var chunkPos: Vec3 = ChunkMath.getChunkPosition(block.position);
    var chunkSet: CropSet = this.getCropSet(chunkPos);
    // update
    chunkSet.update(null, block, data);
    // delete the chunk set if it's empty
    if(chunkSet.size == 0){
      this.chunks.delete(chunkPos.toString());
    }
  }

  /**
   * Event handler for when a crop block is removed
   * @param oldBlock The old block
   * @param newBlock The new block
   * @param data The associated crop data
   */
  private onCropBlockRemove(oldBlock: Block, newBlock: Block, data: crops.Data){
    // the crop set
    var chunkPos: Vec3 = ChunkMath.getChunkPosition(newBlock.position);
    var chunkSet: CropSet;
    // special procedure for stalk-type crops (sugar cane, bamboo)
    if(data.growth == crops.GrowthType.Stalk){
      let b1 = this.bot.blockAt(newBlock.position.offset(0, -1, 0));
      let b2 = this.bot.blockAt(newBlock.position.offset(0, -2, 0));
      // we only need to know if stalks are 2 blocks tall
      if(b2 === null || crops.plants[b2.name] === data){return}
      // is the block under the same crop?
      else if(b1 !== null && crops.plants[b1.name] === data){
        chunkPos = ChunkMath.getChunkPosition(newBlock.position.offset(0, -1, 0));
        chunkSet = this.getCropSet(chunkPos);
        chunkSet.update(oldBlock, newBlock, data);
      }
      // if not...
      else {
        chunkSet = this.getCropSet(chunkPos);
        chunkSet.delete(newBlock);
      }
    }
    // for other crops
    else {
      chunkSet = this.getCropSet(chunkPos);
      chunkSet.delete(newBlock);
    }
    // delete the chunk set if it's empty
    if(chunkSet.size == 0){
      this.chunks.delete(chunkPos.toString());
    }
  }

  /**
   * Event handler for when a harvest block is broken (stem crops only)
   * @param block The block
   * @param data The associated crop data
   */
  private onHarvestBlockRemove(block: Block, data: crops.Data){
    // only applies to stem crops
    if(data.growth != crops.GrowthType.Stem){
      return;
    }
    // get the XZ position of the harvest block in chunk
    let chunk = ChunkMath.getChunkPosition(block.position);
    let x = block.position.x - (chunk.x * 16);
    let z = block.position.z - (chunk.z * 16);
    // normal check
    this.checkHarvestBlock(true, block, chunk);
    // boundary checks
    this.checkHarvestBlock(x == 0, block, chunk.offset(-1, 0, 0));
    this.checkHarvestBlock(x == 15, block, chunk.offset(1, 0, 0));
    this.checkHarvestBlock(z == 0, block, chunk.offset(0, 0, -1));
    this.checkHarvestBlock(z == 15, block, chunk.offset(0, 0, 1));
  }

  /**
   * Checks if an adjacent chest contains the given harvest block
   * @param condition The condition (this function will exit if false)
   * @param block The block
   * @param chunk The position of the block's chunk
   */
  private checkHarvestBlock(condition: boolean, block: Block, chunk: Vec3){
    if(condition){
      let c = chunk.toString();
      if(this.chunks.has(c) && this.chunks.get(c)!.canHarvest(block.position)){
        this.chunks.get(c)!.delete(block);
      }
    }
  }
  
  /**
   * Gets a crop set, or creates it if it doesn't exist
   * @param position The position
   * @returns The crop set
   */
  private getCropSet(position: Vec3): CropSet {
    var chunkKey = position.toString();
    if(!this.chunks.has(chunkKey)){
      this.chunks.set(chunkKey, new CropSet(this.bot));
    }
    return this.chunks.get(chunkKey)!;
  } 
}


declare module "mineflayer" {
  interface Bot {
    cropRegistry: CropRegistry;
  }
}