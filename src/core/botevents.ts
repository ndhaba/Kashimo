import {Bot, BotOptions} from "mineflayer";
import {Block} from "prismarine-block";
import logger from "./logger";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

declare module "mineflayer" {
  interface BotEvents {
    chestBreak: (block: Block) => void;
    chestPlace: (block: Block) => void;
    signEdit: (block: Block, oldText: string, newText: string) => void;
    signBreak: (block: Block) => void;
  }
}

export default function addCustomEvents(bot: Bot, options: BotOptions){
  bot.on("blockUpdate", async function(oldBlock, newBlock){
    if(!oldBlock){
      return;
    }
    if(oldBlock.name == "chest" || newBlock.name == "chest"){
      if(newBlock.name == "air" ){
        bot.emit("chestBreak", oldBlock);
      }else{
        bot.emit("chestPlace", newBlock);
      }
    }
    if(newBlock.name.endsWith("_sign")){
      let oldText = oldBlock.getSignText ? oldBlock.getSignText()[0].trim() : "";
      let newText = oldText;
      for(let time = 0; time < 20; time += 5){
        await sleep(5);
        let block = bot.blockAt(newBlock.position, true) as Block;
        newText = block.getSignText()[0].trim();
        if(oldText != newText){
          bot.emit("signEdit", block, oldText, newText);
          break;
        }
      }
    }else if(oldBlock.name.endsWith("_sign")){
      bot.emit("signBreak", oldBlock);
    }
  });
}