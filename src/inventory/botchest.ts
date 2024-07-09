import {Vec3} from "vec3";
import {Block} from "prismarine-block";

import logger from "../core/logger";
import SQLite from "better-sqlite3";

const facingMap: {[x: string]: number} = {north: 0, south: 1, west: 2, east: 3};
const typeMap: {[x: string]: number} = {left: 0, right: 1, single: 2};

export class BotChest extends Vec3 {
  public id: number;
  public facing: number;
  public type: number;

  /**
   * Initializes a chest position in the format of a bot chest in the database
   * @param id The chest's ID
   * @param x The chest's x position
   * @param y The chest's y position
   * @param z The chest's z position
   * @param facing The direction in which the chest is facing
   * @param type The type of chests
   */
  constructor(id: number, x: number, y: number, z: number, facing: number, type: number){
    super(x, y, z);
    this.id = id;
    this.facing = facing;
    this.type = type;
  }

  /**
   * Returns a fake BotChest representing the position of the chest's other half
   * @returns A BotChest, or undefined if this chest is a single chest
   */
  adjacent(): BotChest | undefined {
    if(this.type == 2){
      return;
    }
    switch(this.facing){
      case 0:
        return new BotChest(0, this.x + (this.type == 0 ? 1 : -1), this.y, this.z, this.facing, 1 - this.type);
      case 1:
        return new BotChest(0, this.x - (this.type == 0 ? 1 : -1), this.y, this.z, this.facing, 1 - this.type);
      case 2:
        return new BotChest(0, this.x, this.y, this.z - (this.type == 0 ? 1 : -1), this.facing, 1 - this.type);
      case 3:
        return new BotChest(0, this.x, this.y, this.z + (this.type == 0 ? 1 : -1), this.facing, 1 - this.type);
    }
  }

  /**
   * Returns a fake BotChest representing the position of the block above
   */
  over(): BotChest {
    return new BotChest(0, this.x, this.y + 1, this.z, -1, -1);
  }
  
  /**
   * Returns a vector representing the position of the block below
   */
  under(): BotChest {
    return new BotChest(0, this.x, this.y - 1, this.z, -1, -1);
  }

  vec(): Vec3 {
    return new Vec3(this.x, this.y, this.z);
  }

  /**
   * Updates the BotChest object with the in-world block's properties
   * @param block The block
   * @returns Whether or not the update succeeded
   */
  updateFromBlock(block: Block): boolean {
    if(block.name != "chest"){
      return false;
    }
    let properties: any = block.getProperties();
    if(this.facing == facingMap[properties.facing] && this.type == typeMap[properties.type]){
      return false;
    }
    this.facing = facingMap[properties.facing];
    this.type = typeMap[properties.type];
    return true;
  }
};

export class BotChestFactory {
  private selectChestS: SQLite.Statement;
  private insertChestS: SQLite.Statement;
  private updateChestS: SQLite.Statement;
  private deleteChestS: SQLite.Statement;

  constructor(database: SQLite.Database, chestTable: string){    
    // get all of the table names
    var tableNames: Set<string> = new Set(database.prepare("SELECT name FROM sqlite_master WHERE type = ?").all("table").map((v: any) => v.name));

    // make sure the tables we need exist
    if(!tableNames.has(chestTable)){
      database.exec(`CREATE TABLE "${chestTable}" ("id" INTEGER NOT NULL UNIQUE, "x" INTEGER NOT NULL, "y" INTEGER NOT NULL, "z" INTEGER NOT NULL, "facing" INTEGER NOT NULL, "type" INTEGER NOT NULL, PRIMARY KEY("id"));`);
    }

    // prepare a ton of statements
    this.selectChestS = database.prepare(`SELECT * FROM ${chestTable} WHERE id = ?`);
    this.insertChestS = database.prepare(`INSERT INTO ${chestTable} (x, y, z, facing, type) VALUES (?, ?, ?, ?, ?) RETURNING id`);
    this.updateChestS = database.prepare(`UPDATE ${chestTable} SET facing = ?, type = ? WHERE id = ?`);
    this.deleteChestS = database.prepare(`DELETE FROM ${chestTable} WHERE id = ?`);
  }

  /**
   * Creates a BotChest object from a block
   * @param block The block
   * @returns The BotChest object, or undefined if the process failed
   */
  create(block: Block): BotChest | undefined {
    if(block.name != "chest"){
      return;
    }
    var properties: any = block.getProperties();
    var facing = facingMap[properties.facing];
    var type = typeMap[properties.type];
    var row: any = this.insertChestS.get(block.position.x, block.position.y, block.position.z, facing, type);
    if(!row){
      logger.warn("BotChestFactory.create(): Row was not created o_o");
      return;
    }
    return new BotChest(row.id, block.position.x, block.position.y, block.position.z, facing, type);
  }

  /**
   * Attempts to retrieve a bot chest with the given ID from the database
   * @param id The ID
   * @returns A BotChest object, or undefined if the chest does not exist
   */
  pull(id: number): BotChest | undefined {
    var row: any = this.selectChestS.get(id);
    if(!row){
      return;
    }
    return new BotChest(id, row.x, row.y, row.z, row.facing, row.type);
  }

  /**
   * Pushes the BotChest object's data to the database
   * @param chest The chest
   * @returns Whether or not this process succeeded
   */
  push(chest: BotChest): boolean {
    if(chest.id == 0){
      let row: any = this.insertChestS.get(chest.x, chest.y, chest.z, chest.facing, chest.type);
      if(!row){
        logger.warn("BotChestFactory.push(): Row was not created o_o");
        return false;
      }
      chest.id = row.id;
    }else{
      var changes = this.updateChestS.run(chest.facing, chest.type, chest.id).changes;
      if(changes != 1){
        if(changes > 1){
          logger.warn("BotChestFactory.push(): More than one row has been updated o_o");
        }
        return false;
      } 
    }
    return true;
  }

  /**
   * Removes the data linked to a BotChest object
   * @param chest The chest
   * @returns Whether or not this process succeeded
   */
  remove(chest: BotChest): boolean {
    if(chest.id <= 0){
      logger.warn("BotChestFactory.remove(): ID is zero");
      return false;
    }
    var rowCount = this.deleteChestS.run(chest.id).changes;
    if(rowCount != 1){
      if(rowCount > 1){
        logger.warn("BotChestFactory.remove(): More than one row has been removed o_o");
      }
      return false;
    }
    chest.id = 0;
    return true;
  }

  /**
   * Updates a BotChest object with data from the database
   * @param chest The chest
   * @returns Whether or not this process succeeded
   */
  update(chest: BotChest): boolean {
    if(chest.id <= 0){
      logger.warn("BotChestFactory.update(): ID is zero");
      return false;
    }
    var data : any = this.selectChestS.get(chest.id);
    if(!data){
      logger.warn("BotChestFactory.update(): Database does not contain block");
      return false;
    }
    chest.x = data.x;
    chest.y = data.y;
    chest.z = data.z;
    chest.facing = data.facing;
    chest.type = data.type;
    return true;
  }
};