use azalea::{Account, Client, Event};
use tokio::task::JoinHandle;

pub type KResult<T> = Result<T, Box<dyn std::error::Error>>;

pub struct Kashimo {
	pub client: Client,
	pub account: Account,
	pub event_handler: Option<JoinHandle<()>>
}


impl Kashimo {
	pub async fn connect(host: &str) -> KResult<Kashimo> {
		let account = Account::offline("Kashimo");
		let (client, mut rx) = Client::join(&account, host).await?;
		let handler = tokio::spawn(async move {
			while let Some(event) = rx.recv().await {
				Kashimo::handle_event(event).await.unwrap();
			}
		});
		Ok(Kashimo {
			client: client,
			account: account,
			event_handler: Some(handler)
		})
	}

	pub async fn wait_for_event_handler(&mut self) -> KResult<()> {
		match &mut self.event_handler {
			Some(handler) => {
				handler.await?;
				self.event_handler = None;
			}
			None => {}
		}
		Ok(())
	}

	async fn handle_event(event: Event) -> KResult<()> {
		match event {
			Event::Chat(msg) => {
				println!("{}", msg.message().to_ansi());
			}
			_ => {}
		}
		Ok(())
	}
}