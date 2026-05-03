use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum AnswerHistoryTargetType {
    Objective,
    Writing,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnswerHistoryQuestionSummary {
    pub target_id: String,
    pub label: String,
    pub module: String,
    pub target_type: AnswerHistoryTargetType,
    pub revision_count: i64,
    pub answered: bool,
    pub final_value: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnswerHistorySectionStat {
    pub module: String,
    pub total_revisions: i64,
    pub edited_targets: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnswerHistorySignal {
    pub signal_type: String,
    pub severity: String,
    pub message: String,
    pub evidence: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnswerHistoryOverview {
    pub submission_id: String,
    pub attempt_id: String,
    pub schedule_id: String,
    pub exam_id: String,
    pub exam_title: String,
    pub candidate_id: String,
    pub candidate_name: String,
    pub candidate_email: String,
    pub started_at: Option<DateTime<Utc>>,
    pub submitted_at: Option<DateTime<Utc>>,
    pub total_revisions: i64,
    pub total_targets_edited: i64,
    pub question_summaries: Vec<AnswerHistoryQuestionSummary>,
    pub section_stats: Vec<AnswerHistorySectionStat>,
    pub signals: Vec<AnswerHistorySignal>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnswerHistoryCheckpoint {
    pub id: String,
    pub index: i64,
    pub mutation_id: String,
    pub mutation_type: String,
    pub timestamp: DateTime<Utc>,
    pub client_timestamp: DateTime<Utc>,
    pub server_received_at: DateTime<Utc>,
    pub mutation_seq: i64,
    pub applied_revision: Option<i32>,
    pub summary: String,
    pub delta_chars: i64,
    pub state_snapshot: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnswerHistoryTechnicalLogRow {
    pub mutation_id: String,
    pub mutation_type: String,
    pub mutation_seq: i64,
    pub payload: Value,
    pub client_timestamp: DateTime<Utc>,
    pub server_received_at: DateTime<Utc>,
    pub applied_revision: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnswerHistoryTargetDetail {
    pub submission_id: String,
    pub attempt_id: String,
    pub schedule_id: String,
    pub target_id: String,
    pub target_label: String,
    pub module: String,
    pub target_type: AnswerHistoryTargetType,
    pub final_state: Value,
    pub checkpoints: Vec<AnswerHistoryCheckpoint>,
    pub replay_steps: Vec<AnswerHistoryCheckpoint>,
    pub technical_logs: Vec<AnswerHistoryTechnicalLogRow>,
    pub signals: Vec<AnswerHistorySignal>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AnswerHistoryExportFormat {
    Json,
    Csv,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnswerHistoryExport {
    pub format: AnswerHistoryExportFormat,
    pub filename: String,
    pub content_type: String,
    pub content: String,
}
