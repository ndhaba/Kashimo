import { Block } from "prismarine-block";
import { Vec3 } from "vec3";

import * as crops from "./CropData";

export default class Crop {
  readonly data: crops.Data;
  readonly position: Vec3;

  private _exists: boolean;
  private age: number;

  /**
   * Constructs a crop object
   * @param block The block
   */
  constructor(block: Block){
    if(!crops.plants[block.name]){
      throw new Error("Attempted to create a Crop object from a non-plant");
    }
    this.data = crops.plants[block.name];
    this.position = block.position;
    
    this._exists = true;
    this.age = 0;
  }

  /**
   * Whether or not this crop exists
   */
  get exists(): boolean {
    return this._exists;
  }

  /**
   * Returns whether or not the crop can be harvested
   */
  canHarvest(): boolean {
    if(!this._exists){
      return false;
    }
    switch(this.data.growth){
      case crops.GrowthType.InPlace: return this.age == this.data.age;
      case crops.GrowthType.Stalk: return this.age == 1;
      case crops.GrowthType.Stem: return this.age == this.data.age + 1;
    }
  }

  /**
   * Updates the crop
   * @param block The block
   * @returns Whether or not the crop was updated
   */
  update(block: Block): Vec3 | boolean {
    // this crop must already exist
    if(this._exists === false){
      return false;
    }
    // this method depends on the type of growth
    switch(this.data.growth){
      // does this crop grow in place (e.g. wheat, potato, beetroots)?
      case crops.GrowthType.InPlace: {
        if(!block.position.equals(this.position)){
          return false;
        }
        if(crops.plants[block.name] !== this.data){
          return this._exists = false;
        }
        let properties = block.getProperties();
        this.age = properties.age as number;
        if(this.age == this.data.age){
          return this.position;
        }
        return true;
      }
      
      // does this crop grow to an adjacent block (e.g. melon, pumpkin)?
      case crops.GrowthType.Stem: {
        if(!block.position.equals(this.position)){
          return false;
        }
        if(crops.plants[block.name] !== this.data){
          return this._exists = false;
        }
        let properties = block.getProperties();
        if(properties.facing){
          this.age = this.data.age + 1;
          switch(properties.facing){
            case "north": return this.position.offset(0, 0, -1);
            case "south": return this.position.offset(0, 0, 1);
            case "west": return this.position.offset(-1, 0, 0);
            case "east": return this.position.offset(1, 0, 0);
          }
        }else if(properties.age){
          this.age = properties.age as number;
        }
        return true;
      }

      // does this crop grow upward (e.g. sugar cane, bamboo)?
      case crops.GrowthType.Stalk: {
        if(block.position.equals(this.position)){
          if(crops.plants[block.name] !== this.data){
            return this._exists = false;
          }
          return false;
        }
        if(!block.position.equals(this.position.offset(0, 1, 0))){
          return false;
        }
        this.age = crops.plants[block.name] === this.data ? 1 : 0;
        if(this.age === 0){
          return true;
        }
        return block.position;
      }
    }
  }
}