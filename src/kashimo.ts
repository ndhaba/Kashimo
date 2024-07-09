import * as mineflayer from "mineflayer";
import SQLite from "better-sqlite3";
import addCustomBotEvents from "./core/botevents";

import IPCChannel from "./core/ipc";
import logger from "./core/logger";
import { GameData } from "./core/gamedata";
import BotStorage from "./inventory/botstorage";
import FarmTask from "./farming/farmtask";
import { Action } from "./core/task";
import { pathfinder } from "mineflayer-pathfinder";

var db: SQLite.Database;
var bot: mineflayer.Bot;

const ipc = new IPCChannel(process);

ipc.once("start", function(options, databasePath){
  // open the database
  db = new SQLite(databasePath);
  // create the bot
  bot = mineflayer.createBot(options);
  bot.loadPlugin(pathfinder);
  bot.loadPlugin(addCustomBotEvents);
  // once we finish connecting...
  bot.once("spawn", async function(){
    // create important structures
    bot.gameData = new GameData(bot);
    bot.personalStorage = new BotStorage(bot, ipc, db);
    // let the block know
    logger.info("The bot has spawned in!");
    // farm
    var farm = new FarmTask(bot);
    while(true){
      let gen = farm.start();
      let next: Action | void;
      while(next = gen.next().value){
        await next;
      }
    }
  });
  // stop command for testing
  bot.on("messagestr", function(msg){
    if(msg.includes("stop")){
      bot!.quit();
      setImmediate(function(){
        process.exit(0);
      });
    }
  })
});

setImmediate(function(){
  ipc.send("ready");
});