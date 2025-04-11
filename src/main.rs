use kashimo::{KResult, Kashimo};

mod kashimo;

#[tokio::main]
async fn main() -> KResult<()> {
	let bot = Kashimo::connect("localhost:44377").await?;
	bot.wait_for_events().await?;
	Ok(())
}