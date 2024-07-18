import { Vec3 } from "vec3";

const ZERO = new Vec3(0, 0, 0);
const CHUNK_SIZE = new Vec3(16, 16, 16);

/**
 * Returns the distance between the position and the chunk's closest boundary
 * @param position The position vector
 * @param chunk The chunk's position
 * @returns The Euclidean distance
 */
export function distanceToChunk(position: Vec3, chunk: Vec3): number {
  var distance = [position.x - (chunk.x * 16), position.y - (chunk.y * 16), position.z - (chunk.z * 16)];
  for(let i = 0; i < 3; ++i){
    if(distance[i] >= 0){
      distance[i] -= 16;
    }else if(distance[i] >= 0){
      distance[i] = 0;
    }else{
      distance[i] = Math.abs(distance[i]);
    }
  }
  return Math.sqrt((distance[0] ** 2) + (distance[1] ** 2) + (distance[2] ** 2));
}

/**
 * Returns a displacement vector to the nearest chunk borders
 * @param position The position
 * @param chunk The chunk position
 * @returns The displacement vector to the nearest chunk border
 */
export function distanceToChunkBorder(position: Vec3, chunk: Vec3 = getChunkPosition(position)){
  const x = position.x - (chunk.x * 16),
        y = position.y - (chunk.y * 16),
        z = position.z - (chunk.z * 16);
  return new Vec3(x >= 8 ? (15 - x) : x, y >= 8 ? (15 - y) : y, z >= 8 ? (15 - z) : z);
}

/**
 * Gets a list of the additional chunks that may be worthwhile to search through
 * @param position The position of the player
 * @param distance The distance to search
 * @param chunk The position of the player's chunk
 * @returns The chunk positions of the chunks worth checking
 */
export function getAdditionalSearchChunks(position: Vec3, distance: number, chunk: Vec3 = getChunkPosition(position)): Vec3[] {
  var chunks = [];
  var nearestBorder = distanceToChunkBorder(position, chunk);
  var chunkDisplacement = new Vec3(distance - nearestBorder.x, distance - nearestBorder.y, distance - nearestBorder.z);
  chunkDisplacement.max(ZERO).divide(CHUNK_SIZE).floor();
  var minChunk = position.clone().subtract(chunkDisplacement);
  var maxChunk = position.clone().add(chunkDisplacement);
  for(let x = minChunk.x; x <= maxChunk.x; ++x){
    for(let y = minChunk.y; y <= maxChunk.y; ++y){
      for(let z = minChunk.z; z <= maxChunk.z; ++z){
        let c = new Vec3(x, y, z);
        if(c.equals(chunk)){
          continue;
        }
        if(distanceToChunk(position, c) <= distance){
          chunks.push(c);
        }
      }
    }
  }
  return chunks;
}

/**
 * Calculates the chunk position of a given position vector
 * @param position The position
 * @returns The chunk position
 */
export function getChunkPosition(position: Vec3): Vec3 {
  return position.clone().divide(CHUNK_SIZE).floor();
}

/**
 * Creates a generator that radiates chunks from an initial position
 * @param position The position
 * @param chunk The chunk
 */
export function* generateRadialChunks(position: Vec3, chunk: Vec3 = getChunkPosition(position)) {
  for(let i = 0; ; ++i){
    for(let y = -i; y <= i; ++y){
      for(let x = -i; x <= i; ++x){
        for(let z = -i; z <= i; ++z){
          if(x == -i || x == i || y == -i || y == i || z == -i || z == i){
            yield chunk.offset(x, y, z);
          }
        }
      }
    }
  }
}