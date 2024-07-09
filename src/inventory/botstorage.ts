import SQLite from "better-sqlite3";
import IPCChannel from "../core/ipc";
import {GameData, Tool, ToolType} from "../core/gamedata";

import {Bot, Chest} from "mineflayer";
import {Block} from "prismarine-block";
import {BotChest, BotChestFactory} from "./botchest";
import {goals} from "mineflayer-pathfinder";
import {Item} from "prismarine-item";
import {Vec3} from "vec3";

function findSignAttachedBlock(block: Block): Vec3 | undefined {
  if(!block.name.endsWith("_sign")){
    return;
  }
  var pos = block.position;
  var props = block.getProperties();
  if(block.name.endsWith("_hanging_sign")){
    return new Vec3(pos.x, pos.y + 1, pos.z);
  }
  switch(props.facing){
    case "north":
      return new Vec3(pos.x, pos.y, pos.z + 1);
    case "south":
      return new Vec3(pos.x, pos.y, pos.z - 1);
    case "east":
      return new Vec3(pos.x - 1, pos.y, pos.z);
    case "west":
      return new Vec3(pos.x + 1, pos.y, pos.z);
    default:
      return new Vec3(pos.x, pos.y - 1, pos.z);
  }
}

export default class BotStorage {
  // Main Properties
  private bot: Bot;
  private channel: IPCChannel;
  private chests: Map<string, BotChest>;
  private chestIds: Map<number, string>;
  private factory: BotChestFactory;

  // Item Cache
  private chestItems: Map<string, string[]>;
  private itemLocations: Map<string, Set<string>>;
  private tools: Map<string, Tool[]>;
  private uncached: Set<string>;
  private justCached: Set<string>;

  // SQLite Statements
  private begin: SQLite.Statement;
  private commit: SQLite.Statement;

  /**
   * Initializes a manager for the bot's storage
   * @param bot The mineflayer bot
   * @param channel The IPC channel with the server
   * @param database The database
   */
  constructor(bot: Bot, channel: IPCChannel, database: SQLite.Database){
    // Main Properties
    this.bot = bot;
    this.channel = channel;
    this.chests = new Map();
    this.chestIds = new Map();
    this.factory = new BotChestFactory(database, "bot_chests");

    // Item Cache
    this.chestItems = new Map();
    this.itemLocations = new Map();
    this.tools = new Map();
    this.justCached = new Set();

    // SQLite Statements
    this.begin = database.prepare("BEGIN");
    this.commit = database.prepare("COMMIT");

    // load the entire table
    var rows: any[] = database.prepare("SELECT * FROM bot_chests").all();
    for(let row of rows){
      let chest = new BotChest(row.id, row.x, row.y, row.z, row.facing, row.type);
      this.chests.set(chest.toString(), chest);
    }
    this.uncached = new Set(this.chests.keys());

    // event listeners
    bot.on("chestBreak", this.onChestBreak.bind(this));
    bot.on("chestPlace", this.onChestPlace.bind(this));
    bot.on("chestLidMove", this.onChestLidMove.bind(this));
    bot.on("signEdit", this.onSignEdit.bind(this));
    channel.on("addBotChest", this.onChestAdded.bind(this));
    channel.on("removeBotChest", this.onChestRemoved.bind(this));
  }

  /**
  * Attempts to add a chest to the list
  * @param block The chest block
  */
  private add(block: Block) {
    // begin the database transaction
    this.begin.run();
    // if the block isn't a chest, don't add it
    if(block.name != "chest"){
      return 0;
    }
    // some vars
    var additions = [];
    var chest: BotChest;
    var edits = [];
    var key = block.position.toString();
    // is this chest not already registered (the main procedure)
    if(!this.chests.has(key)){
      // create a new row in the database, and add to the uncached set
      chest = this.factory.create(block)!;
      this.chests.set(key, chest);
      this.uncached.add(key);
      additions.push(chest.id);
    // if this chest is registered...
    }else{
      chest = this.chests.get(key)!;
      // do we have updated block info?
      if(chest.updateFromBlock(block)){
        // push changes to the database, and uncache
        this.factory.push(chest);
        this.uncache(key);
        edits.push(key);
      }
    }
    // add or update adjacent chest
    var adjacent = chest.adjacent();
    // does the adjacent chest exist?
    if(adjacent){
      // get adjacent key and Block
      let adjkey = adjacent.toString();
      let adjblock = this.bot.blockAt(adjacent);
      // is the adjacent chest already registered
      if(this.chests.has(adjkey)){
        adjacent = this.chests.get(adjkey)!;
        // did we just update the block's properties
        if(adjblock && adjacent.updateFromBlock(adjblock)){
          // push changes to database and uncache
          this.factory.push(adjacent);
          this.uncache(adjkey);
          edits.push(adjkey);
        }
      // if not, let's add it with the block info we may or may not have
      }else if(adjblock && adjacent.updateFromBlock(adjblock)){
        // push changes to database and add to uncached set
        this.factory.push(adjacent);
        this.chests.set(adjkey, adjacent);
        this.uncached.add(adjkey);
        additions.push(adjacent.id);
      }
    }
    // commit to the database
    this.commit.run();
    // send events if needed
    if(additions.length != 0) this.channel.send("addBotChest", additions);
    if(edits.length != 0) this.channel.send("updateBotChest", edits);
  }

  /**
   * Caches the chest with the given key
   * @param key The key
   * @param start The slot to start at
   * @param end The slot to end at (non-inclusive)
   */
  cache(key: string, inventory: Chest, start?: number, end?: number){
    // is this chest not registered?
    if(!this.chests.has(key)){
      return;
    }
    // were we not given a start and end point?
    if(end === undefined){
      // is this a double chest?
      let chest = this.chests.get(key)!;
      if(chest.type != 2){
        let adjkey = chest.adjacent()!.toString();
        this.cache(chest.type == 0 ? key : adjkey, inventory, 0, 27);
        this.cache(chest.type == 0 ? adjkey : key, inventory, 27, 54);
      }
      // otherwise...
      else{
        this.cache(key, inventory, 0, inventory.inventoryStart);
      }
    }
    // uncache first
    this.uncache(key);
    // some variables (great description i know)
    var full = true;
    var items = [];
    var tools = [];
    // iterate over every slot in the chest inventory
    for(var slot = start!; slot < end!; ++slot){
      // is there an item here?
      if(!inventory.slots[slot]){
        full = false;
        continue;
      }
      // is this item a tool?
      let item = inventory.slots[slot]!;
      let tool = this.bot.gameData.toTool(item);
      if(tool !== undefined){
        tools.push(tool);
        continue;
      }
      // is this the first slot to have the item?
      if(!this.itemLocations.has(item.name)){
        this.itemLocations.set(item.name, new Set([key]));
        items.push(item.name);
      // is this chest not already marked as a location?
      }else if(!this.itemLocations.get(item.name)!.has(key)){
        this.itemLocations.get(item.name)!.add(key);
        items.push(item.name);
      }
    }
    // we gotta know if the chest has free slots
    if(!full){
      items.push("free_slot");
      // is this the first free chest?
      if(!this.itemLocations.has("free_slot")){
        this.itemLocations.set("free_slot", new Set([key]));
      // is this chest not already marked as a location
      }else if(!this.itemLocations.get("free_slot")!.has(key)){
        this.itemLocations.get("free_slot")!.add(key);
      }
    }
    // update chestItems
    if(items.length != 0){
      this.chestItems.set(key, items);
    }
    // update chestTools
    if(tools.length != 0){
      this.tools.set(key, tools);
    }
    // add to justCached
    this.justCached.add(key);
  }

  /**
   * Creates a composite goal with all of the chests given
   * @param keys The keys of the chests to include
   */
  createGoal(keys: string[]): goals.GoalCompositeAny<goals.GoalLookAtBlock> {
    var subgoals: goals.GoalLookAtBlock[] = [];
    for(let key of keys){
      if(!this.chests.has(key)) continue;
      subgoals.push(new goals.GoalLookAtBlock(this.chests.get(key)!, this.bot.world));
    }
    return new goals.GoalCompositeAny(subgoals);
  }

  /**
   * Evaluates each cached tool with the given evaluator function
   * @param evaluator The evaluator function. Return false to abort iteration.
   */
  forEachTool(evaluator: (key: string, tool: Tool) => unknown){
    for(let [key, tools] of this.tools){
      for(let tool of tools){
        if(evaluator(key, tool) === false) return;
      }
    }
  }

  /**
   * Returns a list of the positions of every chest that can be opened at the bot's position
   * @param keys The keys of the chests to check
   * @param remove Whether or not to remove the reachable chests from keys
   * @returns A list of vectors
   */
  filterReachable(keys: string[], remove: boolean = true): Vec3[] {
    // the vectors
    var list: Vec3[] = [];
    // we need to also filter out adjacent chests
    var adjacents: Set<string> = new Set();
    // iterate over each key
    var i = 0;
    while(i < keys.length){
      // get the block
      let key = keys[i++];
      let chest = this.chests.get(key)!;
      let block = this.bot.blockAt(chest);
      // is it loaded?
      if(!block) continue;
      // has the adjacent chest already been marked
      if(chest.type != 2 && adjacents.has(chest.adjacent()!.toString())){
        if(remove) keys.splice(--i, 1);
        continue;
      }
      // can the block be seen?
      if(!this.bot.canSeeBlock(block)) continue;
      // add to the list
      list.push(block.position);
      if(remove) keys.splice(--i, 1);
      // add to adjacents if it's not a single chest
      if(chest.type != 2) adjacents.add(key);
    }
    // return the lsit
    return list;
  }

  /**
   * Returns a list of the keys of every uncached chest
   */
  getUncached(): string[] {
    return Array.from(this.uncached);
  }

  /**
   * Event handler for when chests are added (by another process)
   * @param chests The IDs in the database
   */
  private onChestAdded(chests: number[]): void {
    // begin transaction
    this.begin.run();
    // iterate over each ID
    for(let id of chests){
      let chest = this.factory.pull(id);
      // if it doesn't exist... ?
      if(!chest){
        continue;
      }
      // add the chest
      this.chests.set(chest.toString(), chest);
      this.uncached.add(chest.toString());
    }
    // commit
    this.commit.run();
  }

  /**
   * Event handler for when a chest is broken
   * @param block The chest block
   */
  private onChestBreak(block: Block): void {
    var key = block.position.toString();
    // if the chest isn't registered...
    if(!this.chests.has(key)){
      return;
    }
    // if there's an adjacent chest, it has to be single now... i think :3
    var chest = this.chests.get(key)!;
    var adjacent = this.chests.get((chest.adjacent() || "nah").toString());
    if(adjacent !== undefined){
      adjacent.type = 2; // single
      this.factory.push(adjacent);
      this.channel.send("updateBotChest", [adjacent.toString()]);
    }
    // remove
    this.factory.remove(chest);
    this.chests.delete(key);
    this.uncache(key, false);
    this.channel.send("removeBotChest", [chest.toString()]);
  }

  /**
   * Event handler for when a chest's lid is moved
   * @param block The principal chest block
   * @param isOpen The number of players that have this chest block open
   * @param block2 The other half of the chest, if it's a double chest
   */
  private onChestLidMove(block: Block, isOpen: number, block2: Block | null){
    // we only care about when the chest is open
    if(isOpen == 0){
      return;
    }
    // get the chest keys
    var key1 = block.toString();
    var key2 = (block2 || "nah").toString();
    // this event fires even when the bot opens the chest, let's not uncache when the bot opens
    console.log("lid moved");
    if(this.justCached.has(key1) || this.justCached.has(key2)){
      this.justCached.delete(key1);
      this.justCached.delete(key2);
      return;
    }
    // uncache if they are registered
    if(this.chests.has(key1)) this.uncache(key1);
    if(this.chests.has(key2)) this.uncache(key2);
  }

  /**
   * Event handler for when a chest is placed
   * @param block The chest block
   */
  private onChestPlace(block: Block): void {
    // get the string key
    var key = block.position.toString();
    // is the chest somehow already registered????
    if(this.chests.has(key)){
      let chest = this.chests.get(key)!;
      // do we have updated block info?
      if(chest.updateFromBlock(block)){
        // push to the database and uncache
        this.factory.push(chest);
        this.channel.send("updateBotChest", [key]);
        this.uncache(key);
      }
      // we need not do more
      return;
    }
    // pseudo chest object and adjacent chest
    var chest = new BotChest(0, block.position.x, block.position.y, block.position.z, -1, -1);
    var adjacent = chest.adjacent();
    var adjacentKey = (adjacent || "nah").toString();
    // if the adjacent chest isn't registered, then we have no business with this block
    if(!this.chests.has(adjacentKey)){
      return;
    }
    // update block info and add to uncached set
    chest.updateFromBlock(block);
    this.chests.set(key, chest);
    this.uncached.add(key);
    // replace the pseudo adjacent chest object with the real adjacent chest object
    adjacent = this.chests.get(adjacentKey)!;
    let adjacentBlock = this.bot.blockAt(adjacent);
    // do we have updated adjacent chest block info?
    if(adjacentBlock && adjacent.updateFromBlock(adjacentBlock)){
      this.channel.send("updateBotChest", [adjacentKey]);
    }
    // add the chest to the database
    this.factory.push(chest);
    this.channel.send("addBotChest", [chest.id]);
  }

  /**
   * Event handler for when chests are removed
   * @param chests The chests to remove
   */
  private onChestRemoved(chests: string[]): void {
    // database and adjacency is already handled for us, all we have to do is remove associated data on this end
    for(let key of chests){
      let chest = this.chests.get(key);
      // make sure the chests is able to be removed
      if(chest === undefined){
        continue;
      }
      // remove and uncache
      this.chests.delete(key);
      this.uncache(key, false);
    }    
  }

  /**
   * Event handler for when a sign is edited
   * @param block The sign block
   * @param oldText The sign's old text
   * @param newText The sign's new text
   */
  private onSignEdit(block: Block, oldText: string, newText: string): void {
    // make sure the atached block is a chest
    var attachedBlock = this.bot.blockAt(findSignAttachedBlock(block)!);
    if(!attachedBlock || attachedBlock.name != "chest"){
      return;
    }
    // what does the sign say :3
    switch(newText.toLowerCase()){
      case "kashimo":
        this.add(attachedBlock);
        break;
      case "kashino":
        this.remove(attachedBlock);
        break;
    }
  };

  /**
   * Attempts to remove the given chest block from the list
   * @param block The chest block
   */
  private remove(block: Block) {
    // do not remove if it isn't a chest
    if(block.name != "chest"){
      return;
    }
    var key = block.position.toString();
    // if this chest isn't registered, don't remove it
    if(!this.chests.has(key)){
      return;
    }
    // begin database transaction
    this.begin.run();
    // vars
    var chest = this.chests.get(key)!;
    var removals = [];
    var adjacent = chest.adjacent(), adjkey: string;
    // is the adjacent chest registered?
    if(adjacent && this.chests.has(adjkey = adjacent.toString())){
      // remove the adjacent chest and delete cache
      adjacent = this.chests.get(adjkey)!;
      this.factory.remove(adjacent);
      this.chests.delete(adjkey);
      this.uncache(adjkey, false);
      removals.push(adjkey);
    }
    // remove the chest
    this.factory.remove(chest);
    this.chests.delete(key);
    this.uncache(key, false);
    removals.push(key);
    // commit database transaction
    this.commit.run();
    // send deletion event
    this.channel.send("removeBotChest", removals);
  }

  /**
   * Returns the number of chests registered
   */
  size(){
    return this.chests.size;
  }

  /**
   * Uncaches the chest with the given key
   * @param key The key
   * @param mark Whether or not to mark this chest as uncached
   */
  private uncache(key: string, mark: boolean = true){
    // does this chest have normal items (non-tools)?
    if(this.chestItems.has(key)){
      // clear this chest out of itemLocations
      for(let name of this.chestItems.get(key)!){
        // make sure the set in itemLocations exists
        let locs = this.itemLocations.get(name);
        if(!locs) continue;
        // remove this chest and delete the set if this was the only chest
        locs.delete(key);
        if(locs.size == 0){
          this.itemLocations.delete(name);
        }
      }
      // remove from chestItems
      this.chestItems.delete(key);
    }
    // does this chest have tools?
    if(this.tools.has(key)){
      this.tools.delete(key);
    }
    // has this chest been marked as uncached?
    if(mark && !this.uncached.has(key)){
      this.uncached.add(key);
    }
  }
}

declare module "mineflayer" {
  interface Bot {
    personalStorage: BotStorage
  }
}