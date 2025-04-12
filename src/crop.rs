use azalea::{
    blocks::properties::{
        BeetrootsAge, CarrotsAge, FacingCardinal, MelonStemAge, PotatoesAge, PumpkinStemAge,
        SugarCaneAge, WheatAge,
    },
    protocol::packets::game::ClientboundBlockUpdate,
    BlockPos, Client,
};

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
    pub fn from_block_update(client: &Client, update: ClientboundBlockUpdate) -> Option<Self> {
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
            })
        }
        // Sugar Cane
        else if let Some(_age) = update.block_state.property::<SugarCaneAge>() {
            let below_one_pos = update.pos.down(1);
            let below_two_pos = update.pos.down(2);
            let (below_one, below_two) = {
                let world = client.world();
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
                    pos: below_one_pos,
                    species: CropSpecies::SugarCane,
                    harvest_position: None,
                });
            }
            if below_two.is_none() || below_two.unwrap().property::<SugarCaneAge>().is_none() {
                return None;
            }
            Some(Crop {
                pos: below_one_pos,
                species: CropSpecies::SugarCane,
                harvest_position: Some(update.pos),
            })
        }
        // Otherwise
        else {
            None
        }
    }
}
