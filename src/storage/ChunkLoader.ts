import ChunkRegistry from "./ChunkRegistry";

import { Bot } from "mineflayer";
import { Block } from "prismarine-block";
import { Vec3 } from "vec3";

export default class ChunkLoader {
  private bot: Bot;
  private registries: ChunkRegistry[];
  private scanned: Map<string, boolean>;

  constructor(bot: Bot){
    this.bot = bot;
    this.registries = [];
    this.scanned = new Map();

    this.bot.on("blockUpdate", this.onBlockUpdate.bind(this));
  }

  inject(registry: ChunkRegistry){
    this.registries.push(registry);
  }

  scan(chunkPos: Vec3){
    // do not do redundant scans
    let chunkKey = chunkPos.toString();
    if(this.scanned.get(chunkKey)){
      return;
    }
    // get the chunk object
    var column: any = this.bot.world.getColumn(chunkPos.x, chunkPos.z);
    if(!column){
      return;
    }
    var chunk: any = column.sections[chunkPos.y + Math.abs((this.bot.game as any).minY >> 4)];
    if(!chunk){
      return;
    }
    // check the palette entries
    let relevants: Set<ChunkRegistry> = new Set();
    for(let paletteEntry of chunk.palette){
      for(let registry of this.registries){
        if(relevants.has(registry)){
          continue;
        }
        if(registry.checkPalette(paletteEntry)){
          relevants.add(registry);
        }
      }
    }
    this.scanned.set(chunkKey, true);
    if(relevants.size == 0){
      return;
    }
    // check all 4,096 blocks
    for(let x = 0; x < 16; ++x){
      for(let y = chunkPos.y * 16; y < chunkPos.y * 16 + 16; ++y){
        for(let z = 0; z < 16; ++z){
          for(let registry of relevants){
            registry.checkBlock(column, chunkPos, x, y, z);
          }
        }
      }
    }
  }

  private onBlockUpdate(oldBlock: Block | null, newBlock: Block){
    for(let registry of this.registries){
      registry.onBlockUpdate(oldBlock, newBlock);
    }
  }
}

declare module "mineflayer" {
  interface Bot {
    chunkLoader: ChunkLoader
  }
}