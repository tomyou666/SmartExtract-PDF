//src/schemas/chat.py

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

// SessionCreate
#[derive(Debug, Serialize, Deserialize)]
pub struct SessionCreate {
    pub pdf_id: Option<i32>,
    #[serde(default = "default_title")]
    pub title: String,
}

// Pydanticのデフォルト値を再現する関数
fn default_title() -> String {
    "新規チャット".to_string()
}

// SessionOut
#[derive(Debug, Serialize, Deserialize)]
pub struct SessionOut {
    pub id: Uuid,
    pub pdf_id: Option<i32>,
    pub title: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

// MessageOut
#[derive(Debug, Serialize, Deserialize)]
pub struct MessageOut {
    pub id: Uuid,
    pub session_id: Uuid,
    pub role: String,
    pub content_json: Value, // dict[str, Any] は serde_json::Value
    pub created_at: DateTime<Utc>,
}

// MessageIn
#[derive(Debug, Serialize, Deserialize)]
pub struct MessageIn {
    pub role: String,
    pub content: Vec<Value>, // list[dict] は Vec<Value>
}

// SessionUpdate
#[derive(Debug, Serialize, Deserialize)]
pub struct SessionUpdate {
    pub title: String,
}
