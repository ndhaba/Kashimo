
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
    var data: crops.Data | undefined = (oldBlock === null ? undefined : crops.plants[oldBlock.name]) || crops.plants[newBlock.name];
    if(data === undefined){
      let harvestData: crops.Data | undefined = (oldBlock === null ? undefined : crops.harvest[oldBlock.name]) || crops.harvest[newBlock.name];
      if(harvestData === undefined){
        return;
      }
      return this.onBlockUpdate$harvest(newBlock, harvestData);
    }
    var pos = newBlock.position.clone();
    if(data.growth == crops.GrowthType.Stalk){
      let b1 = this.bot.blockAt(newBlock.position.offset(0, -1, 0));
      if(b1 === null){
        return;
      }
      if(crops.plants[b1.name] === data){
        let b2 = this.bot.blockAt(newBlock.position.offset(0, -2, 0));
        if(b2 === null || crops.plants[b2.name] !== undefined){
          return;
        }
        --pos.y;
      }else if(!crops.stalkGround.has(b1.name)){
        return;
      }
    }
    var chunk = ChunkMath.getChunkPosition(pos);
    var chunkKey = chunk.toString();
    if(!this.chunks.has(chunkKey)){
      this.chunks.set(chunkKey, new CropSet(this.bot));
    }
    var set = this.chunks.get(chunkKey)!;
    set.use(newBlock);
    if(set.size === 0){
      this.chunks.delete(chunkKey);
    }
  }

  private onBlockUpdate$harvest(block: Block, data: crops.Data) {
    if(data.growth != crops.GrowthType.Stem){
      return;
    }
    let chunk = ChunkMath.getChunkPosition(block.position);
    let x = block.position.x - (chunk.x * 16);
    let z = block.position.z - (chunk.z * 16);
    if(x == 0){
      let c = chunk.offset(-1, 0, 0).toString();
      if(this.chunks.has(c) && this.chunks.get(c)!.has(block.position)){
        this.chunks.get(c)!.use(block);
        return;
      }
    }else if(x == 15){
      let c = chunk.offset(1, 0, 0).toString();
      if(this.chunks.has(c) && this.chunks.get(c)!.has(block.position)){
        this.chunks.get(c)!.use(block);
        return;
      }
    }
    if(z == 0){
      let c = chunk.offset(0, 0, -1).toString();
      if(this.chunks.has(c) && this.chunks.get(c)!.has(block.position)){
        this.chunks.get(c)!.use(block);
        return;
      }
    }else if(z == 15){
      let c = chunk.offset(0, 0, 1).toString();
      if(this.chunks.has(c) && this.chunks.get(c)!.has(block.position)){
        this.chunks.get(c)!.use(block);
        return;
      }
    }
    if(this.chunks.has(chunk.toString())){
      this.chunks.get(chunk.toString())!.use(block);
    }
  }
}


declare module "mineflayer" {
  interface Bot {
    cropRegistry: CropRegistry;
  }
}