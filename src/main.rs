use error::KResult;
use kashimo::Kashimo;

mod crop;
mod error;
mod harvest;
mod kashimo;

#[tokio::main]
async fn main() -> KResult<()> {
    let (bot, receiver) = Kashimo::connect("localhost:44377").await?;
    Kashimo::wait_for_events(&bot, receiver).await.unwrap();
    Ok(())
}
