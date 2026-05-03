use chrono::{DateTime, Utc};
use ielts_backend_domain::answer_history::{
    AnswerHistoryCheckpoint, AnswerHistoryExport, AnswerHistoryExportFormat, AnswerHistoryOverview,
    AnswerHistoryQuestionSummary, AnswerHistorySectionStat, AnswerHistorySignal,
    AnswerHistoryTargetDetail, AnswerHistoryTargetType, AnswerHistoryTechnicalLogRow,
};
use serde_json::{json, Value};
use sqlx::{FromRow, MySqlPool};
use std::collections::{BTreeMap, HashMap, HashSet};
use thiserror::Error;
use uuid::Uuid;

#[derive(Error, Debug)]
pub enum AnswerHistoryError {
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("Not found")]
    NotFound,
    #[error("Validation error: {0}")]
    Validation(String),
}

pub struct AnswerHistoryService {
    pool: MySqlPool,
}

#[derive(Debug, Clone, FromRow)]
struct SubmissionAttemptContextRow {
    submission_id: String,
    attempt_id: String,
    schedule_id: String,
    exam_id: String,
    exam_title: String,
    candidate_id: String,
    candidate_name: String,
    candidate_email: String,
    started_at: DateTime<Utc>,
    submitted_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, FromRow)]
struct MutationRow {
    id: String,
    mutation_type: String,
    mutation_seq: i64,
    payload: Value,
    client_timestamp: DateTime<Utc>,
    server_received_at: DateTime<Utc>,
    applied_revision: Option<i32>,
}

#[derive(Debug, Clone, FromRow)]
struct AuditSignalRow {
    action_type: String,
    payload: Option<Value>,
    created_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
struct TargetMutation {
    module: String,
    target_id: String,
    target_type: AnswerHistoryTargetType,
    row: MutationRow,
}

impl AnswerHistoryService {
    pub fn new(pool: MySqlPool) -> Self {
        Self { pool }
    }

    pub async fn resolve_submission_id_from_attempt(
        &self,
        attempt_id: Uuid,
    ) -> Result<String, AnswerHistoryError> {
        sqlx::query_scalar::<_, String>(
            "SELECT id FROM student_submissions WHERE attempt_id = ? LIMIT 1",
        )
        .bind(attempt_id.to_string())
        .fetch_optional(&self.pool)
        .await?
        .ok_or(AnswerHistoryError::NotFound)
    }

    pub async fn get_overview(
        &self,
        submission_id: Uuid,
    ) -> Result<AnswerHistoryOverview, AnswerHistoryError> {
        let context = self.load_context(submission_id).await?;
        let mutations = self.load_mutations(&context.attempt_id).await?;
        let target_mutations = mutations
            .iter()
            .filter_map(classify_target_mutation)
            .collect::<Vec<_>>();

        let mut revision_counts = HashMap::<(AnswerHistoryTargetType, String), i64>::new();
        let mut final_states = HashMap::<(AnswerHistoryTargetType, String), Value>::new();
        let mut target_modules = HashMap::<(AnswerHistoryTargetType, String), String>::new();

        for target in &target_mutations {
            let key = (target.target_type.clone(), target.target_id.clone());
            *revision_counts.entry(key.clone()).or_insert(0) += 1;
            target_modules
                .entry(key.clone())
                .or_insert_with(|| target.module.clone());

            let prev = final_states.remove(&key).unwrap_or(Value::Null);
            let next = apply_mutation_to_state(&prev, &target.row);
            final_states.insert(key, next);
        }

        let mut section_revision_counts = HashMap::<String, i64>::new();
        let mut section_targets = HashMap::<String, HashSet<String>>::new();
        let mut question_summaries = Vec::<AnswerHistoryQuestionSummary>::new();

        let mut keys = revision_counts.keys().cloned().collect::<Vec<_>>();
        keys.sort_by(|left, right| left.1.cmp(&right.1));

        for (target_type, target_id) in keys {
            let module = target_modules
                .get(&(target_type.clone(), target_id.clone()))
                .cloned()
                .unwrap_or_else(|| "unknown".to_string());
            let revision_count = *revision_counts
                .get(&(target_type.clone(), target_id.clone()))
                .unwrap_or(&0);
            let final_value = final_states
                .get(&(target_type.clone(), target_id.clone()))
                .cloned()
                .unwrap_or(Value::Null);

            *section_revision_counts.entry(module.clone()).or_insert(0) += revision_count;
            section_targets
                .entry(module.clone())
                .or_default()
                .insert(format!("{:?}:{target_id}", target_type));

            question_summaries.push(AnswerHistoryQuestionSummary {
                target_id: target_id.clone(),
                label: target_id.clone(),
                module,
                target_type,
                revision_count,
                final_value,
            });
        }

        let mut section_stats = section_revision_counts
            .into_iter()
            .map(|(module, total_revisions)| AnswerHistorySectionStat {
                edited_targets: section_targets
                    .get(&module)
                    .map(|items| items.len() as i64)
                    .unwrap_or(0),
                module,
                total_revisions,
            })
            .collect::<Vec<_>>();
        section_stats.sort_by(|left, right| left.module.cmp(&right.module));

        let signals = self
            .build_global_signals(
                &context.schedule_id,
                &context.attempt_id,
                &target_mutations,
                context.submitted_at,
            )
            .await?;

        Ok(AnswerHistoryOverview {
            submission_id: context.submission_id,
            attempt_id: context.attempt_id,
            schedule_id: context.schedule_id,
            exam_id: context.exam_id,
            exam_title: context.exam_title,
            candidate_id: context.candidate_id,
            candidate_name: context.candidate_name,
            candidate_email: context.candidate_email,
            started_at: Some(context.started_at),
            submitted_at: context.submitted_at,
            total_revisions: target_mutations.len() as i64,
            total_targets_edited: question_summaries.len() as i64,
            question_summaries,
            section_stats,
            signals,
        })
    }

    pub async fn get_target_detail(
        &self,
        submission_id: Uuid,
        target_type: AnswerHistoryTargetType,
        target_id: &str,
        cursor: Option<i64>,
        limit: usize,
    ) -> Result<AnswerHistoryTargetDetail, AnswerHistoryError> {
        let context = self.load_context(submission_id).await?;
        let rows = self.load_mutations(&context.attempt_id).await?;
        let mut matching = rows
            .into_iter()
            .filter_map(|row| classify_target_mutation(&row))
            .filter(|item| item.target_type == target_type && item.target_id == target_id)
            .collect::<Vec<_>>();

        matching.sort_by(|left, right| {
            left.row
                .server_received_at
                .cmp(&right.row.server_received_at)
                .then(left.row.mutation_seq.cmp(&right.row.mutation_seq))
                .then(left.row.id.cmp(&right.row.id))
        });

        let cursor_seq = cursor.unwrap_or(i64::MIN);
        let page_limit = limit.max(1);

        let mut checkpoints = Vec::<AnswerHistoryCheckpoint>::new();
        let mut technical_logs = Vec::<AnswerHistoryTechnicalLogRow>::new();
        let mut state = Value::Null;
        let mut previous_seen = BTreeMap::<String, usize>::new();
        let mut replay_signals = Vec::<AnswerHistorySignal>::new();
        let mut emitted = 0usize;

        for (index, item) in matching.iter().enumerate() {
            let prior_state = state.clone();
            state = apply_mutation_to_state(&state, &item.row);
            let delta_chars = value_char_len(&state) - value_char_len(&prior_state);
            let summary = describe_mutation(&item.row);

            let canonical = canonical_value(&state);
            if let Some(first_seen_index) = previous_seen.get(&canonical) {
                if *first_seen_index + 1 < index {
                    replay_signals.push(AnswerHistorySignal {
                        signal_type: "RESTORED_ANSWER".to_string(),
                        severity: "medium".to_string(),
                        message: "A previously used answer state was restored.".to_string(),
                        evidence: json!({
                            "checkpointIndex": index as i64 + 1,
                            "restoredFrom": *first_seen_index as i64 + 1,
                        }),
                    });
                }
            }
            previous_seen.insert(canonical, index);

            if item.row.mutation_seq <= cursor_seq || emitted >= page_limit {
                continue;
            }

            checkpoints.push(AnswerHistoryCheckpoint {
                id: format!("cp-{}", item.row.id),
                index: index as i64 + 1,
                mutation_id: item.row.id.clone(),
                mutation_type: item.row.mutation_type.clone(),
                timestamp: item.row.server_received_at,
                client_timestamp: item.row.client_timestamp,
                server_received_at: item.row.server_received_at,
                mutation_seq: item.row.mutation_seq,
                applied_revision: item.row.applied_revision,
                summary,
                delta_chars,
                state_snapshot: state.clone(),
            });

            technical_logs.push(AnswerHistoryTechnicalLogRow {
                mutation_id: item.row.id.clone(),
                mutation_type: item.row.mutation_type.clone(),
                mutation_seq: item.row.mutation_seq,
                payload: item.row.payload.clone(),
                client_timestamp: item.row.client_timestamp,
                server_received_at: item.row.server_received_at,
                applied_revision: item.row.applied_revision,
            });
            emitted += 1;
        }

        let mut signals = self
            .build_target_signals(&checkpoints, context.submitted_at, target_type.clone())
            .await?;
        signals.extend(replay_signals);

        let module = matching
            .first()
            .map(|item| item.module.clone())
            .unwrap_or_else(|| match target_type {
                AnswerHistoryTargetType::Objective => "objective".to_string(),
                AnswerHistoryTargetType::Writing => "writing".to_string(),
            });

        Ok(AnswerHistoryTargetDetail {
            submission_id: context.submission_id,
            attempt_id: context.attempt_id,
            schedule_id: context.schedule_id,
            target_id: target_id.to_string(),
            target_label: target_id.to_string(),
            module,
            target_type,
            final_state: state,
            replay_steps: checkpoints.clone(),
            checkpoints,
            technical_logs,
            signals,
        })
    }

    pub async fn export_target(
        &self,
        submission_id: Uuid,
        target_type: AnswerHistoryTargetType,
        target_id: &str,
        format: AnswerHistoryExportFormat,
    ) -> Result<AnswerHistoryExport, AnswerHistoryError> {
        let detail = self
            .get_target_detail(submission_id, target_type, target_id, None, usize::MAX)
            .await?;

        match format {
            AnswerHistoryExportFormat::Json => Ok(AnswerHistoryExport {
                format,
                filename: format!("answer-history-{}.json", detail.target_id),
                content_type: "application/json".to_string(),
                content: serde_json::to_string_pretty(&detail)
                    .map_err(|err| AnswerHistoryError::Validation(err.to_string()))?,
            }),
            AnswerHistoryExportFormat::Csv => {
                let mut csv = String::from(
                    "checkpointIndex,mutationId,mutationType,mutationSeq,clientTimestamp,serverReceivedAt,deltaChars,summary,stateSnapshot\n",
                );
                for checkpoint in &detail.checkpoints {
                    let state_json = serde_json::to_string(&checkpoint.state_snapshot)
                        .unwrap_or_else(|_| "{}".to_string())
                        .replace('"', "\"\"");
                    let summary = checkpoint.summary.replace('"', "\"\"");
                    csv.push_str(&format!(
                        "{},\"{}\",\"{}\",{},\"{}\",\"{}\",{},\"{}\",\"{}\"\n",
                        checkpoint.index,
                        checkpoint.mutation_id,
                        checkpoint.mutation_type,
                        checkpoint.mutation_seq,
                        checkpoint.client_timestamp.to_rfc3339(),
                        checkpoint.server_received_at.to_rfc3339(),
                        checkpoint.delta_chars,
                        summary,
                        state_json,
                    ));
                }

                Ok(AnswerHistoryExport {
                    format,
                    filename: format!("answer-history-{}.csv", detail.target_id),
                    content_type: "text/csv".to_string(),
                    content: csv,
                })
            }
        }
    }

    async fn load_context(
        &self,
        submission_id: Uuid,
    ) -> Result<SubmissionAttemptContextRow, AnswerHistoryError> {
        sqlx::query_as::<_, SubmissionAttemptContextRow>(
            r#"
            SELECT
                submissions.id AS submission_id,
                submissions.attempt_id AS attempt_id,
                submissions.schedule_id AS schedule_id,
                submissions.exam_id AS exam_id,
                submissions.cohort_name AS exam_title,
                attempts.candidate_id AS candidate_id,
                attempts.candidate_name AS candidate_name,
                attempts.candidate_email AS candidate_email,
                attempts.created_at AS started_at,
                submissions.submitted_at AS submitted_at
            FROM student_submissions submissions
            JOIN student_attempts attempts ON attempts.id = submissions.attempt_id
            WHERE submissions.id = ?
            LIMIT 1
            "#,
        )
        .bind(submission_id.to_string())
        .fetch_optional(&self.pool)
        .await?
        .ok_or(AnswerHistoryError::NotFound)
    }

    async fn load_mutations(
        &self,
        attempt_id: &str,
    ) -> Result<Vec<MutationRow>, AnswerHistoryError> {
        Ok(sqlx::query_as::<_, MutationRow>(
            r#"
            SELECT
                id,
                mutation_type,
                mutation_seq,
                payload,
                client_timestamp,
                server_received_at,
                applied_revision
            FROM student_attempt_mutations
            WHERE attempt_id = ?
            ORDER BY server_received_at ASC, mutation_seq ASC, id ASC
            "#,
        )
        .bind(attempt_id)
        .fetch_all(&self.pool)
        .await?)
    }

    async fn build_global_signals(
        &self,
        schedule_id: &str,
        attempt_id: &str,
        target_mutations: &[TargetMutation],
        submitted_at: Option<DateTime<Utc>>,
    ) -> Result<Vec<AnswerHistorySignal>, AnswerHistoryError> {
        let mut signals = Vec::new();

        if let (Some(last), Some(submitted)) = (
            target_mutations
                .iter()
                .max_by_key(|item| item.row.server_received_at),
            submitted_at,
        ) {
            let diff = submitted.signed_duration_since(last.row.server_received_at);
            if diff.num_seconds() >= 0 && diff.num_seconds() <= 60 {
                signals.push(AnswerHistorySignal {
                    signal_type: "LATE_FINAL_EDIT".to_string(),
                    severity: "medium".to_string(),
                    message: "Final change happened shortly before submission.".to_string(),
                    evidence: json!({
                        "secondsBeforeSubmission": diff.num_seconds(),
                        "mutationId": last.row.id,
                    }),
                });
            }
        }

        let audit_rows = sqlx::query_as::<_, AuditSignalRow>(
            r#"
            SELECT action_type, payload, created_at
            FROM session_audit_logs
            WHERE schedule_id = ? AND target_student_id = ?
            ORDER BY created_at DESC
            LIMIT 100
            "#,
        )
        .bind(schedule_id)
        .bind(attempt_id)
        .fetch_all(&self.pool)
        .await?;

        for row in audit_rows {
            if matches!(
                row.action_type.as_str(),
                "NETWORK_DISCONNECTED" | "HEARTBEAT_LOST" | "DEVICE_CONTINUITY_FAILED"
            ) {
                signals.push(AnswerHistorySignal {
                    signal_type: row.action_type,
                    severity: "high".to_string(),
                    message: "Operational integrity signal recorded during session.".to_string(),
                    evidence: json!({
                        "at": row.created_at,
                        "payload": row.payload,
                    }),
                });
            }
        }

        Ok(signals)
    }

    async fn build_target_signals(
        &self,
        checkpoints: &[AnswerHistoryCheckpoint],
        submitted_at: Option<DateTime<Utc>>,
        target_type: AnswerHistoryTargetType,
    ) -> Result<Vec<AnswerHistorySignal>, AnswerHistoryError> {
        let mut signals = Vec::new();

        if checkpoints.len() >= 2 {
            for window in checkpoints.windows(2) {
                if let [left, right] = window {
                    let gap = right
                        .server_received_at
                        .signed_duration_since(left.server_received_at)
                        .num_seconds();
                    if gap >= 300 {
                        signals.push(AnswerHistorySignal {
                            signal_type: "LONG_PAUSE_BEFORE_EDIT".to_string(),
                            severity: "low".to_string(),
                            message: "Long pause observed before a subsequent edit.".to_string(),
                            evidence: json!({
                                "pauseSeconds": gap,
                                "fromMutationId": left.mutation_id,
                                "toMutationId": right.mutation_id,
                            }),
                        });
                    }
                }
            }
        }

        if target_type == AnswerHistoryTargetType::Writing {
            for checkpoint in checkpoints {
                if checkpoint.delta_chars >= 80 {
                    signals.push(AnswerHistorySignal {
                        signal_type: "LARGE_TEXT_INCREASE".to_string(),
                        severity: "medium".to_string(),
                        message: "Large text increase detected within a single checkpoint."
                            .to_string(),
                        evidence: json!({
                            "deltaChars": checkpoint.delta_chars,
                            "mutationId": checkpoint.mutation_id,
                        }),
                    });
                    break;
                }
            }
        }

        if let (Some(last), Some(submitted)) = (checkpoints.last(), submitted_at) {
            let diff = submitted
                .signed_duration_since(last.server_received_at)
                .num_seconds();
            if diff >= 0 && diff <= 60 {
                signals.push(AnswerHistorySignal {
                    signal_type: "LATE_FINAL_EDIT".to_string(),
                    severity: "medium".to_string(),
                    message: "Final target edit happened close to submission.".to_string(),
                    evidence: json!({
                        "secondsBeforeSubmission": diff,
                        "mutationId": last.mutation_id,
                    }),
                });
            }
        }

        Ok(signals)
    }
}

fn classify_target_mutation(row: &MutationRow) -> Option<TargetMutation> {
    let payload = &row.payload;
    let module = payload
        .get("module")
        .and_then(Value::as_str)
        .unwrap_or(
            if matches!(
                row.mutation_type.as_str(),
                "SetEssayText" | "ClearEssayText"
            ) {
                "writing"
            } else {
                "objective"
            },
        )
        .to_string();

    if matches!(
        row.mutation_type.as_str(),
        "SetEssayText" | "ClearEssayText"
    ) {
        let task_id = payload.get("taskId")?.as_str()?.to_string();
        return Some(TargetMutation {
            module,
            target_id: task_id,
            target_type: AnswerHistoryTargetType::Writing,
            row: row.clone(),
        });
    }

    let question_id = payload.get("questionId")?.as_str()?.to_string();
    Some(TargetMutation {
        module,
        target_id: question_id,
        target_type: AnswerHistoryTargetType::Objective,
        row: row.clone(),
    })
}

fn apply_mutation_to_state(state: &Value, row: &MutationRow) -> Value {
    match row.mutation_type.as_str() {
        "SetSlot" => {
            let mut slots = state.as_array().cloned().unwrap_or_default();
            let slot_index = row
                .payload
                .get("slotIndex")
                .and_then(Value::as_i64)
                .unwrap_or(0)
                .max(0) as usize;
            while slots.len() <= slot_index {
                slots.push(Value::String(String::new()));
            }
            let value = row
                .payload
                .get("value")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            slots[slot_index] = Value::String(value);
            Value::Array(slots)
        }
        "ClearSlot" => {
            let mut slots = state.as_array().cloned().unwrap_or_default();
            let slot_index = row
                .payload
                .get("slotIndex")
                .and_then(Value::as_i64)
                .unwrap_or(0)
                .max(0) as usize;
            while slots.len() <= slot_index {
                slots.push(Value::String(String::new()));
            }
            slots[slot_index] = Value::String(String::new());
            Value::Array(slots)
        }
        "SetScalar" => Value::String(
            row.payload
                .get("value")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string(),
        ),
        "ClearScalar" => Value::String(String::new()),
        "SetChoice" => row
            .payload
            .get("value")
            .cloned()
            .unwrap_or(Value::Array(vec![])),
        "ClearChoice" => Value::Array(vec![]),
        "SetEssayText" => Value::String(
            row.payload
                .get("value")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string(),
        ),
        "ClearEssayText" => Value::String(String::new()),
        _ => state.clone(),
    }
}

fn describe_mutation(row: &MutationRow) -> String {
    match row.mutation_type.as_str() {
        "SetSlot" => format!(
            "Updated slot {}",
            row.payload
                .get("slotIndex")
                .and_then(Value::as_i64)
                .unwrap_or(0)
                + 1
        ),
        "ClearSlot" => format!(
            "Cleared slot {}",
            row.payload
                .get("slotIndex")
                .and_then(Value::as_i64)
                .unwrap_or(0)
                + 1
        ),
        "SetScalar" => "Updated answer".to_string(),
        "ClearScalar" => "Cleared answer".to_string(),
        "SetChoice" => "Updated choice selection".to_string(),
        "ClearChoice" => "Cleared choice selection".to_string(),
        "SetEssayText" => "Edited essay text".to_string(),
        "ClearEssayText" => "Cleared essay text".to_string(),
        _ => "Mutation applied".to_string(),
    }
}

fn value_char_len(value: &Value) -> i64 {
    match value {
        Value::String(text) => text.chars().count() as i64,
        Value::Array(items) => items.iter().map(value_char_len).sum::<i64>(),
        Value::Null => 0,
        _ => value.to_string().chars().count() as i64,
    }
}

fn canonical_value(value: &Value) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| "null".to_string())
}
