use std::{collections::HashSet, time::Duration};

use azalea::BlockPos;
use lock_api::RwLock;
use parking_lot::RawRwLock;

pub struct HarvestRegistry {
    blocks: RwLock<RawRwLock, HashSet<BlockPos>>,
}

impl HarvestRegistry {
    pub fn new() -> HarvestRegistry {
        HarvestRegistry {
            blocks: RwLock::new(HashSet::new()),
        }
    }

	pub async fn block_broken(&self, pos: BlockPos){
		self.blocks.write().insert(pos);
		tokio::time::sleep(Duration::from_millis(200)).await;
		self.blocks.write().remove(&pos);
	}
}
