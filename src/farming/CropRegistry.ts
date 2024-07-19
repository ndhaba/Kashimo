import Crop from "./Crop";
import ChunkRegistry from "../storage/ChunkRegistry";

import { Bot } from "mineflayer";
import { Block } from "prismarine-block";
import { PCChunk } from "prismarine-chunk";
import { Vec3 } from "vec3";

import * as ChunkMath from "../utils/ChunkMath";
import * as crops from "./CropData";

export default class CropRegistry implements ChunkRegistry {
  private crops: Map<string, Map<string, Crop>>;
  private harvestables: Map<string, Map<string, Vec3>>;

  /**
   * Constructs a crop registry
   * @param bot The bot
   */
  constructor(private bot: Bot){
    this.crops = new Map();
    this.harvestables = new Map();
  }

  /**
   * Checks the block
   * @param chunk The chunk
   * @param chunkPos The chunk's position
   * @param x The x position in chunk
   * @param y The y position in column
   * @param z The z position in chunk
   */
  checkBlock(chunk: PCChunk, chunkPos: Vec3, x: number, y: number, z: number): void {
    var pos = new Vec3(chunkPos.x * 16 + x, y, chunkPos.z * 16 + z);
    var stateId = chunk.getBlockStateId(pos);
    var name = this.bot.mcdata.blocksByStateId[stateId].name;
    if(!crops.plants[name]){
      return;
    }
    var key = pos.toString();
    var block = chunk.getBlock(pos);
    var chunkKey = chunkPos.toString();
    if(this.crops.get(chunkKey)?.has(key) || this.harvestables.get(chunkKey)?.has(key)){
      return;
    }
    block.position = pos;
    this.onBlockUpdate(null, block);
  }

  /**
   * Checks a pallete entry
   * @param stateId The block state ID
   * @returns Whether or not it indicates this registry can make use of the chunk
   */
  checkPalette(stateId: number): boolean {
    return crops.plants[this.bot.mcdata.blocksByStateId[stateId].name] !== undefined;
  }

  /**
   * Returns the vector to the nearest harvestable crop
   */
  *nearest(): Generator<Vec3, void, undefined> {
    if(this.harvestables.size == 0){
      return;
    }
    // initial variables
    var remaining = new Set(this.harvestables.keys());
    var radialGenerator = ChunkMath.generateRadialChunks(this.bot.entity.position);
    // radially search for nearby chunks
    while(remaining.size > this.harvestables.size / 2){
      let chunkKey = (radialGenerator.next().value as Vec3).toString();
      // skip if the chunk has already been scanned, or if it doesn't exist
      if(!remaining.has(chunkKey)){
        continue;
      }
      remaining.delete(chunkKey);
      // skip if the chunk is empty
      let chunk = this.harvestables.get(chunkKey)!;
      if(chunk.size == 0){
        continue;
      }
      // get the nearest harvestables and return them
      yield* sortVectors(chunk, this.bot.entity.position);
    }
    // just pick random chunks at this point
    for(let key of remaining){
      yield* sortVectors(this.harvestables.get(key)!, this.bot.entity.position);
    }
  }

  /**
   * Event handler for block updates
   * @param oldBlock The old block
   * @param newBlock The new block
   */
  onBlockUpdate(oldBlock: Block | null, newBlock: Block): void {
    // get the old and new block crop data
    var oldData = oldBlock === null ? undefined : crops.plants[oldBlock.name];
    var newData = crops.plants[newBlock.name];
    // if the original block wasn't a crop
    if(oldData === undefined){
      // it might've been a harvest block (stem crops only)
      let oldHarvestData = oldBlock === null ? undefined : crops.harvest[oldBlock.name];
      if(oldHarvestData !== undefined && oldHarvestData !== newData){
        this.deleteHarvestable(newBlock.position);
      }
      // if the new block is a crop...
      if(newData !== undefined){
        this.onCropBlockPlace(newBlock, newData);
      }
    }
    // if the new block isn't a crop
    else if(oldData !== newData){
      this.onCropBlockRemove(newBlock, oldData);
      // if new data exists, then this crop was replaced with another
      if(newData !== undefined){
        this.onCropBlockPlace(newBlock, newData);
      }
    }
    // this was an update
    else{
      this.onCropBlockUpdate(newBlock, newData);
    }
  }

  /**
   * Event handler for when a crop block is placed
   * @param block The block
   * @param data The associated crop data
   */
  private onCropBlockPlace(block: Block, data: crops.Data){
    // special procedure for stalk-type crops (sugar cane, bamboo)
    if(data.growth == crops.GrowthType.Stalk){
      let b1p = block.position.offset(0, -1, 0);
      let b2p = block.position.offset(0, -2, 0);
      let b1 = this.bot.blockAt(b1p);
      let b2 = this.bot.blockAt(b2p);
      // we only need to know if stalks are 2 blocks tall
      if(b2 === null || crops.plants[b2.name] === data){
        return;
      }
      // is the block under the same crop?
      else if(b1 !== null && crops.plants[b1.name] === data){
        let crop = this.getCrop(b1p);
        if(crop === undefined){
          this.onCropBlockPlace(block, data);
          crop = this.getCrop(b1p)!;
        }
        let res = crop.update(block);
        if(res instanceof Vec3){
          this.addHarvestable(res);
        }
      }
      // if not...
      else {
        this.addCrop(new Crop(block.position, data));
      }
    }
    // for other crops
    else {
      let crop = new Crop(block.position, data);
      let res = crop.update(block);
      if(res instanceof Vec3){
        this.addHarvestable(res);
      }
      this.addCrop(crop);
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
    // update the crop
    let crop = this.getCrop(block.position);
    if(crop === undefined){
      return this.onCropBlockPlace(block, data);
    }
    // add harvestable if needed
    let result = crop.update(block);
    if(result instanceof Vec3){
      this.addHarvestable(result);
    }
  }

  /**
   * Event handler for when a crop block is removed
   * @param block The block
   * @param data The associated crop data
   */
  private onCropBlockRemove(block: Block, data: crops.Data){
    this.deleteHarvestable(block.position);
    // special procedure for stalk-type crops (sugar cane, bamboo)
    if(data.growth == crops.GrowthType.Stalk){
      let b1p = block.position.offset(0, -1, 0);
      let b2p = block.position.offset(0, -2, 0);
      let b1 = this.bot.blockAt(b1p);
      let b2 = this.bot.blockAt(b2p);
      // we only need to know if stalks are 2 blocks tall
      if(b2 === null || crops.plants[b2.name] === data){
        return;
      }
      // is the block under the same crop?
      else if(b1 !== null && crops.plants[b1.name] === data){
        let crop = this.getCrop(b1p);
        if(crop === undefined){
          this.onCropBlockPlace(block, data);
          crop = this.getCrop(b1p)!;
        }
        crop.update(block);
        return;
      }
      // use normal procedure if the stalk is 1 block
    }
    // for other crops
    let crop = this.getCrop(block.position);
    if(crop === undefined){
      return;
    }
    this.deleteCrop(crop);
  }

  /**
   * Adds a crop
   * @param crop The crop
   */
  private addCrop(crop: Crop){
    var chunkKey = ChunkMath.getChunkPosition(crop.position).toString();
    if(!this.crops.has(chunkKey)){
      this.crops.set(chunkKey, new Map());
    }
    this.crops.get(chunkKey)!.set(crop.position.toString(), crop);
  }

  /**
   * Adds a harvestable
   * @param position The position
   */
  private addHarvestable(position: Vec3) {
    var chunkKey = ChunkMath.getChunkPosition(position).toString();
    if(!this.harvestables.has(chunkKey)){
      this.harvestables.set(chunkKey, new Map());
    }
    this.harvestables.get(chunkKey)!.set(position.toString(), position);
  }

  /**
   * Deletes a crop
   * @param crop The crop
   * @returns Whether or not a crop was removed
   */
  private deleteCrop(crop: Crop): boolean {
    // check if the chunk is being stored
    var chunkKey = ChunkMath.getChunkPosition(crop.position).toString();
    if(!this.crops.has(chunkKey)){
      return false;
    }
    // remove the crop
    var key = crop.position.toString();
    var chunk = this.crops.get(chunkKey)!;
    var result = chunk.delete(key);
    // if the chunk has no crops
    if(chunk.size == 0){
      this.crops.delete(chunkKey);
    }
    return result;
  }

  /**
   * Deletes a harvestable
   * @param position The position
   * @returns Whether or not a harvestable was removed
   */
  private deleteHarvestable(position: Vec3): boolean {
    // check if the chunk is being stored
    var chunkKey = ChunkMath.getChunkPosition(position).toString();
    if(!this.harvestables.has(chunkKey)){
      return false;
    }
    // remove the harvestable
    var key = position.toString();
    var chunk = this.harvestables.get(chunkKey)!;
    var result = chunk.delete(key);
    // if the chunk has no harvestables
    if(chunk.size == 0){
      this.harvestables.delete(chunkKey);
    }
    return result;
  }

  /**
   * Tries to get the crop at the given position
   * @param position The position
   */
  private getCrop(position: Vec3): Crop | undefined {
    return this.crops.get(ChunkMath.getChunkPosition(position).toString())?.get(position.toString());
  }
};

/**
 * Sorts a map storing vectors by proximity to another position vector
 * @param map The map 
 * @param position The position
 * @returns The vectors, sorted
 */
function sortVectors(map: Map<string, Vec3>, position: Vec3): Vec3[] {
  if(map.size == 0){
    return [];
  }
  var vectors: Vec3[] = [];
  var distances: number[] = [];
  for(let vec of map.values()){
    let low = 0;
    let dist = vec.distanceTo(position);
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

declare module "mineflayer" {
  interface Bot {
    cropRegistry: CropRegistry;
  }
}