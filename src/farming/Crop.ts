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
  constructor(position: Vec3, data: crops.Data){
    this.data = data;
    this.position = position;
    
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
   * @param oldBlock The old block
   * @param newBlock The new block
   * @returns Whether or not the crop was updated
   */
  update(oldBlock: Block | null, newBlock: Block): Vec3 | boolean {
    // this crop must already exist
    if(this._exists === false){
      return false;
    }
    // this method depends on the type of growth
    switch(this.data.growth){
      // does this crop grow in place (e.g. wheat, potato, beetroots)?
      case crops.GrowthType.InPlace: {
        // update the age
        let properties = newBlock.getProperties();
        this.age = properties.age as number;
        // if the age is high enough, we're ready to harvest
        if(this.age == this.data.age){
          return this.position;
        }
        return true;
      }
      
      // does this crop grow to an adjacent block (e.g. melon, pumpkin)?
      case crops.GrowthType.Stem: {
        // get the block's properties
        let properties = newBlock.getProperties();
        // if the facing property is present, then the stem is connected to another block we need to harvest
        if(properties.facing){
          this.age = this.data.age + 1;
          switch(properties.facing){
            case "north": return this.position.offset(0, 0, -1);
            case "south": return this.position.offset(0, 0, 1);
            case "west": return this.position.offset(-1, 0, 0);
            case "east": return this.position.offset(1, 0, 0);
          }
        // otherwise, just update the age
        }else if(properties.age){
          this.age = properties.age as number;
        }
        return true;
      }

      // does this crop grow upward (e.g. sugar cane, bamboo)?
      case crops.GrowthType.Stalk: {
        // we only care about the block above
        if(!newBlock.position.equals(this.position.offset(0, 1, 0))){
          return false;
        }
        // crop age is dependent on if this block (1 higher) is an extension of this crop or just air
        this.age = crops.plants[newBlock.name] === this.data ? 1 : 0;
        if(this.age === 0){
          return true;
        }
        // return the block position back if it's an extension
        return newBlock.position;
      }
    }
  }
}