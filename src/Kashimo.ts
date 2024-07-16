import CropRegistry from "./farming/CropRegistry";
import digger from "./plugins/Digger";
import farmer from "./plugins/Farmer";
import mcdata from "minecraft-data";
import mineflayer from "mineflayer";
import Logger from "./utils/Logger";

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
    this.bot.loadPlugin(digger);
    this.bot.loadPlugin(farmer);

    this.bot.once("spawn", async () => {
      this.bot.mcdata = mcdata(this.bot.version);
      this.configure();
      this.bot.cropRegistry = new CropRegistry(this.bot);

      Logger.Info("Bot has spawned in!");

      while(true){
        let nearest = this.bot.cropRegistry.nearest();
        if(nearest){
          await this.bot.harvestCrop(nearest);
        }else if(this.bot.getBlockDropCount() > 0){
          await this.bot.collectBlockDrops();
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