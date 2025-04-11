use kashimo::{KResult, Kashimo};

mod kashimo;

#[tokio::main]
async fn main() -> KResult<()> {
	let mut bot = Kashimo::connect("localhost:44377").await?;
	bot.wait_for_event_handler().await
}