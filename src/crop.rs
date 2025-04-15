use std::{
    collections::{HashMap, HashSet},
    sync::Arc,
};

use azalea::{
    blocks::properties::{
        BeetrootsAge, CarrotsAge, FacingCardinal, MelonStemAge, PotatoesAge, PumpkinStemAge,
        SugarCaneAge, WheatAge,
    },
    protocol::packets::game::ClientboundBlockUpdate,
    world::Instance,
    BlockPos, Vec3,
};
use fixed::{types::extra::U0, FixedI32};
use kiddo::fixed::{distance::Manhattan, kdtree::KdTree};
use lock_api::RwLock;
use parking_lot::RawRwLock;

type CropAxis = FixedI32<U0>;
type CropIdent = u32;

pub enum CropSpecies {
    Wheat,
    Beetroot,
    Potato,
    Carrot,
    PumpkinStem,
    MelonStem,
    SugarCane,
}

pub struct Crop {
    pub pos: BlockPos,
    pub species: CropSpecies,
    pub harvest_position: Option<BlockPos>,
    identifier: CropIdent,
}

fn adjacent_position(pos: BlockPos, facing: FacingCardinal) -> BlockPos {
    match facing {
        FacingCardinal::North => pos.north(1),
        FacingCardinal::South => pos.south(1),
        FacingCardinal::West => pos.west(1),
        FacingCardinal::East => pos.east(1),
    }
}

impl Crop {
    pub fn from_block_update(
        world: &Arc<RwLock<RawRwLock, Instance>>,
        update: &ClientboundBlockUpdate,
    ) -> Option<Self> {
        // Wheat
        if let Some(age) = update.block_state.property::<WheatAge>() {
            Some(Crop {
                pos: update.pos,
                species: CropSpecies::Wheat,
                harvest_position: if matches!(age, WheatAge::_7) {
                    Some(update.pos)
                } else {
                    None
                },
                identifier: 0,
            })
        }
        // Beetroots
        else if let Some(age) = update.block_state.property::<BeetrootsAge>() {
            Some(Crop {
                pos: update.pos,
                species: CropSpecies::Beetroot,
                harvest_position: if matches!(age, BeetrootsAge::_3) {
                    Some(update.pos)
                } else {
                    None
                },
                identifier: 0,
            })
        }
        // Potatoes
        else if let Some(age) = update.block_state.property::<PotatoesAge>() {
            Some(Crop {
                pos: update.pos,
                species: CropSpecies::Potato,
                harvest_position: if matches!(age, PotatoesAge::_7) {
                    Some(update.pos)
                } else {
                    None
                },
                identifier: 0,
            })
        }
        // Carrots
        else if let Some(age) = update.block_state.property::<CarrotsAge>() {
            Some(Crop {
                pos: update.pos,
                species: CropSpecies::Carrot,
                harvest_position: if matches!(age, CarrotsAge::_7) {
                    Some(update.pos)
                } else {
                    None
                },
                identifier: 0,
            })
        }
        // Pumpkin Stem
        else if let Some(age) = update.block_state.property::<PumpkinStemAge>() {
            Some(Crop {
                pos: update.pos,
                species: CropSpecies::PumpkinStem,
                harvest_position: {
                    if let Some(facing) = update.block_state.property::<FacingCardinal>() {
                        if matches!(age, PumpkinStemAge::_7) {
                            Some(adjacent_position(update.pos, facing))
                        } else {
                            None
                        }
                    } else {
                        None
                    }
                },
                identifier: 0,
            })
        }
        // Melon Stem
        else if let Some(age) = update.block_state.property::<MelonStemAge>() {
            Some(Crop {
                pos: update.pos,
                species: CropSpecies::MelonStem,
                harvest_position: {
                    if let Some(facing) = update.block_state.property::<FacingCardinal>() {
                        if matches!(age, MelonStemAge::_7) {
                            Some(adjacent_position(update.pos, facing))
                        } else {
                            None
                        }
                    } else {
                        None
                    }
                },
                identifier: 0,
            })
        }
        // Sugar Cane
        else if let Some(_age) = update.block_state.property::<SugarCaneAge>() {
            let below_one_pos = update.pos.down(1);
            let below_two_pos = update.pos.down(2);
            let (below_one, below_two) = {
                let lock = world.read();
                (
                    lock.get_block_state(&below_one_pos),
                    lock.get_block_state(&below_two_pos),
                )
            };
            if below_one.is_none() {
                return None;
            }
            if below_one.unwrap().property::<SugarCaneAge>().is_none() {
                return Some(Crop {
                    pos: update.pos,
                    species: CropSpecies::SugarCane,
                    harvest_position: None,
                    identifier: 0,
                });
            }
            if below_two.is_none() || below_two.unwrap().property::<SugarCaneAge>().is_none() {
                return None;
            }
            Some(Crop {
                pos: below_one_pos,
                species: CropSpecies::SugarCane,
                harvest_position: Some(update.pos),
                identifier: 0,
            })
        }
        // Otherwise
        else {
            None
        }
    }
}

pub struct CropRegistry {
    crops: HashMap<u32, Crop>,
    identifiers: HashMap<BlockPos, u32>,
    positions: KdTree<CropAxis, u32, 3, 32, u32>,
    world: Arc<RwLock<RawRwLock, Instance>>,
    next_identifier: u32,
    harvest_size: usize,
}

impl CropRegistry {
    pub fn new(world: Arc<RwLock<RawRwLock, Instance>>) -> CropRegistry {
        CropRegistry {
            crops: HashMap::new(),
            identifiers: HashMap::new(),
            positions: KdTree::new(),
            world,
            next_identifier: 0,
            harvest_size: 0,
        }
    }

    pub fn handle_crop_update(&mut self, mut crop: Crop) {
        if !self.identifiers.contains_key(&crop.pos) {
            self.identifiers.insert(crop.pos, self.next_identifier);
            self.next_identifier += 1;
        }
        crop.identifier = self.identifiers[&crop.pos];
        if let Some(old_crop) = self.crops.get(&crop.identifier) {
            if old_crop.harvest_position.is_none() && crop.harvest_position.is_some() {
                self.harvest_size += 1;
            } else if old_crop.harvest_position.is_some() && crop.harvest_position.is_none() {
                self.harvest_size -= 1;
            }
        } else {
            let pos = [
                CropAxis::from(crop.pos.x),
                CropAxis::from(crop.pos.y),
                CropAxis::from(crop.pos.z),
            ];
            self.positions.add(&pos, self.next_identifier);
            if crop.harvest_position.is_some() {
                self.harvest_size += 1;
            }
        }
        self.crops.insert(crop.identifier, crop);
    }

    pub fn handle_block_removal(&mut self, position: BlockPos) {
        if let Some(identifier) = self.identifiers.get(&position) {
            if let Some(old_crop) = self.crops.remove(identifier) {
                let pos = [
                    CropAxis::from(position.x),
                    CropAxis::from(position.y),
                    CropAxis::from(position.z),
                ];
                self.positions.remove(&pos, *identifier);
                if old_crop.harvest_position.is_some() {
                    self.harvest_size -= 1;
                }
                return;
            }
        }
        let below_one = position.down(1);
        if let Some(identifier) = self.identifiers.get(&below_one) {
            if let Some(crop) = self.crops.get_mut(identifier) {
                if matches!(crop.species, CropSpecies::SugarCane) {
                    crop.harvest_position = None;
                    self.harvest_size -= 1;
                }
            }
        }
    }

    pub fn nearest_harvest(
        &self,
        position: Vec3,
        radius: i32,
        excludes: &HashSet<BlockPos>,
    ) -> Option<BlockPos> {
        let position = [
            CropAxis::from(position.x as i32),
            CropAxis::from(position.y as i32),
            CropAxis::from(position.z as i32),
        ];
        let radius = CropAxis::from(radius);
        for result in self.positions.within::<Manhattan>(&position, radius) {
            let crop = self.crops.get(&result.item).unwrap();
            if let Some(harvest_position) = crop.harvest_position {
                if !excludes.contains(&harvest_position) {
                    return Some(harvest_position);
                }
            }
        }
        return None;
    }

    pub fn harvest_size(&self) -> usize {
        self.harvest_size
    }

    pub fn size(&self) -> usize {
        self.crops.len()
    }
}
