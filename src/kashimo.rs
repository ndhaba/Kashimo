use std::sync::Arc;

use azalea::{Account, Client, Event};
use tokio::{sync::Mutex, task::JoinHandle};

pub type KResult<T> = Result<T, Box<dyn std::error::Error>>;

pub struct Kashimo {
	pub client: Client,
	pub account: Account,
	pub event_handler: Mutex<Option<JoinHandle<()>>>
}

impl Kashimo {
	pub async fn connect(host: &str) -> KResult<Arc<Kashimo>> {
		let account = Account::offline("Kashimo");
		let (client, mut receiver) = Client::join(&account, host).await?;
		let kashimo = Arc::new(
			Kashimo {
				client: client,
				account: account,
				event_handler: Mutex::new(None)
			}
		);
		let kashimo_clone = (&kashimo).clone();
		*(kashimo.event_handler.lock().await) = Some(
			tokio::spawn(async move {
				while let Some(event) = receiver.recv().await {
					kashimo_clone.handle_event(event).await;
				}
			}
		));
		Ok(kashimo)
	}

	pub async fn wait_for_events(&self) -> KResult<()> {
		let mut lock = self.event_handler.lock().await;
		match lock.as_mut() {
			Some(handle) => {
				handle.await?;
				*lock = None;
			}
			None => {}
		}
		Ok(())
	}

	async fn handle_event(&self, event: Event) -> () {
		match event {
			Event::Chat(msg) => {
				println!("{}", msg.message().to_ansi());
			}
			_ => {}
		}
	}
}