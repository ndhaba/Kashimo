import ChunkLoader from "./storage/ChunkLoader";
import CropRegistry from "./farming/CropRegistry";
import Harvester from "./plugins/Harvester";
import Logger from "./utils/Logger";
import mcdata from "minecraft-data";
import mineflayer from "mineflayer";
import PlayerInventory from "./plugins/PlayerInventory";

import { Movements, pathfinder } from "mineflayer-pathfinder";
import { Vec3 } from "vec3";

import * as ChunkMath from "./utils/ChunkMath";

function timeout(ms: number){
  return new Promise<void>(function(resolve){
    setTimeout(() => resolve(), ms);
  });
}

export default class Kashimo {
  public bot: mineflayer.Bot;

  private lastCollectAttempt: number = 0;

  constructor(options: mineflayer.BotOptions){
    this.bot = mineflayer.createBot(options);
    this.bot.loadPlugin(pathfinder);

    this.bot.once("spawn", async () => {
      this.bot.mcdata = mcdata(this.bot.version);
      
      this.bot.chunkLoader = new ChunkLoader(this.bot);
      this.bot.cropRegistry = new CropRegistry(this.bot);
      this.bot.chunkLoader.inject(this.bot.cropRegistry);

      this.bot.inv = new PlayerInventory(this.bot);
      this.bot.harvest = new Harvester(this.bot);
      this.configure();

      Logger.Info("Bot has spawned in!");

      this.scanLoop();

      while(true){
        await this.botLoop();
      }
    });
  }

  /**
   * The bot loop
   */
  private async botLoop(){
    let nearest = this.bot.cropRegistry.nearest();
    let nearestVector: Vec3 | void;
    while(undefined !== (nearestVector = nearest.next().value)){
      if(true === await this.bot.harvest.harvest(nearestVector)){
        return;
      }
    }
    if(this.bot.harvest.getBlockDropCount() > 0 && Date.now() >= this.lastCollectAttempt + 1000){
      await this.bot.harvest.collectAllDrops();
      this.lastCollectAttempt = Date.now();
    }else{
      await timeout(1000);
    }
  }

  private async scanLoop(){
    while(true){
      this.bot.chunkLoader.scan(ChunkMath.getChunkPosition(this.bot.entity.position));
      await timeout(1000);
    }
  }

  /**
   * Configures the bot
   */
  private configure(){
    const moves = new Movements(this.bot);
    moves.canDig = false;
    moves.allow1by1towers = false;
    this.bot.pathfinder.setMovements(moves);
  }
}

declare module "mineflayer" {
  interface Bot {
    mcdata: mcdata.IndexedData;
  }
}