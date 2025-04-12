#[derive(Debug)]
pub enum KError {
    ServerJoinError(azalea::JoinError),
}

impl std::fmt::Display for KError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            KError::ServerJoinError(error) => {
                write!(f, "Failed to connect to server: {}", error)
            }
        }
    }
}

impl From<azalea::JoinError> for KError {
    fn from(value: azalea::JoinError) -> Self {
        KError::ServerJoinError(value)
    }
}

pub type KResult<T> = std::result::Result<T, KError>;
