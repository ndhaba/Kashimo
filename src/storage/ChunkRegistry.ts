import { Block } from "prismarine-block";
import { PaletteEntry, PCChunk } from "prismarine-chunk";
import { Vec3 } from "vec3";

export default interface ChunkRegistry {
  checkBlock(chunk: PCChunk, chunkPos: Vec3, x: number, y: number, z: number): void;
  checkPalette(stateId: number): boolean;
  onBlockUpdate(oldBlock: Block | null, newBlock: Block): void;
};