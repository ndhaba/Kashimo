import CropRegistry from "./farming/CropRegistry";
import Harvester from "./plugins/Harvester";
import Logger from "./utils/Logger";
import mcdata from "minecraft-data";
import mineflayer from "mineflayer";
import PlayerInventory from "./plugins/PlayerInventory";

import { Movements, pathfinder } from "mineflayer-pathfinder";

function timeout(ms: number){
  return new Promise<void>(function(resolve, reject){
    setTimeout(() => resolve(), ms);
  });
}

export default class Kashimo {
  public bot: mineflayer.Bot;

  constructor(options: mineflayer.BotOptions){
    this.bot = mineflayer.createBot(options);
    this.bot.loadPlugin(pathfinder);

    this.bot.once("spawn", async () => {
      this.bot.mcdata = mcdata(this.bot.version);
      this.bot.inv = new PlayerInventory(this.bot);
      this.bot.harvest = new Harvester(this.bot);
      this.configure();
      this.bot.cropRegistry = new CropRegistry(this.bot);

      Logger.Info("Bot has spawned in!");

      var lastCollectAttempt = Date.now();
      while(true){
        let nearest = this.bot.cropRegistry.nearest();
        if(nearest){
          await this.bot.harvest.harvest(nearest);
        }else if(this.bot.harvest.getBlockDropCount() > 0 && Date.now() >= lastCollectAttempt + 1000){
          await this.bot.harvest.collectAllDrops();
          lastCollectAttempt = Date.now();
        }else{
          await timeout(1000);
        }
      }
    });
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