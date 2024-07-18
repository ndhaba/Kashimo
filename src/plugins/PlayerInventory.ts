import MinecraftData from "minecraft-data";

import { Bot } from "mineflayer";

export default class PlayerInventory {
  constructor(private bot: Bot){}

  /**
   * Calculates the number of an item in the player's inventory
   * @param id The item name or numerical ID
   */
  count(id: string | number): number {
    if(typeof id == "string"){
      id = this.bot.mcdata.itemsByName[id].id;
    }
    var count = 0;
    for(let slot = this.bot.inventory.inventoryStart; slot < this.bot.inventory.inventoryEnd; ++slot){
      let item = this.bot.inventory.slots[slot];
      if(item === null || item.type !== id){
        continue;
      }
      count += item.count;
    }
    return count;
  }

  /**
   * Calculates the remaining space in inventory for an item
   * @param item The item name or numerical ID
   * @returns The number of space remaining
   */
  getRemainingSpace(id: string | number): number {
    var data: MinecraftData.Item;
    if(typeof id == "string"){
      data = this.bot.mcdata.itemsByName[id];
    }else{
      data = this.bot.mcdata.items[id];
    }
    var count = 0;
    for(let slot = this.bot.inventory.inventoryStart; slot < this.bot.inventory.inventoryEnd; ++slot){
      let item = this.bot.inventory.slots[slot];
      if(item === null){
        count += data.stackSize;
        continue;
      }
      if(item!.type !== data.id){
        continue;
      }
      count += data.stackSize - item!.count;
    }
    return count;
  }
}

declare module "mineflayer" {
  interface Bot {
    inv: PlayerInventory
  }
}