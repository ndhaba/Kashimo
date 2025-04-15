use std::{sync::Arc, time::Duration};

use azalea::{
    protocol::packets::game::ClientboundGamePacket, world::Instance, Account, Client, Event,
};
use lock_api::RwLock;
use parking_lot::RawRwLock;
use tokio::{sync::mpsc::UnboundedReceiver, task::JoinHandle};

use crate::{
    crop::{Crop, CropRegistry},
    error::KResult,
};

pub struct Kashimo {
    client: Client,
    world: Arc<RwLock<RawRwLock, Instance>>,
    crops: RwLock<RawRwLock, CropRegistry>,
}

impl Kashimo {
    pub async fn connect(host: &str) -> KResult<(Arc<Kashimo>, UnboundedReceiver<Event>)> {
        let account = Account::offline("Kashimo");
        let (client, receiver) = Client::join(&account, host).await?;
        let world = (&client).world();
        let kashimo = Arc::new(Kashimo {
            client,
            world: world.clone(),
            crops: RwLock::new(CropRegistry::new(world.clone())),
        });
        Ok((kashimo, receiver))
    }

    pub fn wait_for_events(
        bot: &Arc<Self>,
        mut receiver: UnboundedReceiver<Event>,
    ) -> JoinHandle<()> {
        let bot = bot.clone();
        tokio::spawn(async move {
            while let Some(event) = receiver.recv().await {
                bot.handle_event(event).await;
            }
        })
    }

    pub fn run(bot: &Arc<Self>){
        let bot = bot.clone();
        tokio::spawn(async move {
            loop {
                let skipped: bool = {
                    let crops = bot.crops.read();
                    if crops.harvest_size() == 0 {
                        true
                    } else {
                        // Do something
                        false
                    }
                };
                if skipped {
                    tokio::time::sleep(Duration::from_millis(1000)).await;
                }
            }
        });
    }

    async fn handle_event(&self, event: Event) {
        match event {
            Event::Chat(msg) => {
                println!("{}", msg.message().to_ansi());
            }
            Event::Packet(packet) => match packet.as_ref() {
                ClientboundGamePacket::BlockUpdate(event) => {
                    if event.block_state.is_air() {
                        self.crops.write().handle_block_removal(event.pos);
                        return;
                    }
                    if let Some(crop) = Crop::from_block_update(&self.world, event) {
                        self.crops.write().handle_crop_update(crop);
                    }
                }
                _ => {}
            },
            _ => {}
        }
    }
}
