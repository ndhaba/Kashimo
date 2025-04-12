use std::sync::Arc;

use azalea::{protocol::packets::game::ClientboundGamePacket, Account, Client, Event};
use tokio::{sync::mpsc::UnboundedReceiver, task::JoinHandle};

pub type KResult<T> = Result<T, Box<dyn std::error::Error>>;

pub struct Kashimo {
	client: Client,
	account: Account,
}

impl Kashimo {
	pub async fn connect(host: &str) -> KResult<(Arc<Kashimo>, UnboundedReceiver<Event>)> {
		let account = Account::offline("Kashimo");
		let (client, receiver) = Client::join(&account, host).await?;
		let kashimo = Arc::new(
			Kashimo {
				client,
				account
			}
		);
		Ok((kashimo, receiver))
	}

	pub fn wait_for_events(bot: &Arc<Self>, mut receiver: UnboundedReceiver<Event>) -> JoinHandle<()> {
		let bot = bot.clone();
		tokio::spawn(async move {
			while let Some(event) = receiver.recv().await {
				bot.handle_event(event).await;
			}
		})
	}

	async fn handle_event(&self, event: Event) -> () {
		match event {
			Event::Chat(msg) => {
				println!("{}", msg.message().to_ansi());
			}
			Event::Packet(packet) => {
				match packet.as_ref() {
					ClientboundGamePacket::BlockUpdate(event) => {
						println!("BlockUpdate ({}, {}, {})", event.pos.x, event.pos.y, event.pos.z);
					}
					_ => {}
				}
			}
			_ => {}
		}
	}
}