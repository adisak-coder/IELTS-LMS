use serde_json::Value;
use sqlx::{mysql::MySqlPoolOptions, MySqlPool, Row};
use std::{env, time::Duration};

#[derive(Debug, Clone, Default)]
struct ResetArgs {
    apply: bool,
    strip_enabled: bool,
    exam_id: Option<String>,
    version_id: Option<String>,
    schedule_id: Option<String>,
}

fn parse_args() -> Result<ResetArgs, String> {
    let mut args = env::args().skip(1);
    let mut parsed = ResetArgs::default();

    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--apply" => parsed.apply = true,
            "--strip-enabled" => parsed.strip_enabled = true,
            "--exam-id" => {
                parsed.exam_id = args
                    .next()
                    .map(|value| value.trim().to_owned())
                    .filter(|value| !value.is_empty());
            }
            "--version-id" => {
                parsed.version_id = args
                    .next()
                    .map(|value| value.trim().to_owned())
                    .filter(|value| !value.is_empty());
            }
            "--schedule-id" => {
                parsed.schedule_id = args
                    .next()
                    .map(|value| value.trim().to_owned())
                    .filter(|value| !value.is_empty());
            }
            "--help" | "-h" => {
                return Err(usage());
            }
            unknown => {
                return Err(format!("Unknown argument: {unknown}\n\n{}", usage()));
            }
        }
    }

    Ok(parsed)
}

fn usage() -> String {
    [
        "Usage: cargo run -p ielts-backend-api --bin reset_legacy_sub_answers -- [options]",
        "",
        "Options:",
        "  --apply            Persist changes (default is dry-run)",
        "  --strip-enabled    Also remove sub-answer data when subAnswerModeEnabled is true",
        "  --exam-id <id>     Limit to one exam_id",
        "  --version-id <id>  Limit to one exam version id",
        "  --schedule-id <id> Limit to the schedule's published_version_id",
        "",
        "Examples:",
        "  cargo run -p ielts-backend-api --bin reset_legacy_sub_answers -- --schedule-id <schedule-id>",
        "  cargo run -p ielts-backend-api --bin reset_legacy_sub_answers -- --exam-id <exam-id> --apply",
    ]
    .join("\n")
}

fn should_strip_sub_answer_fields(
    block: &serde_json::Map<String, Value>,
    strip_enabled: bool,
) -> bool {
    if strip_enabled {
        return true;
    }

    match block.get("subAnswerModeEnabled") {
        Some(Value::Bool(true)) => false,
        _ => true,
    }
}

fn sanitize_blocks(blocks: &mut [Value], strip_enabled: bool) -> usize {
    let mut changed = 0usize;

    for block_value in blocks {
        let Some(block) = block_value.as_object_mut() else {
            continue;
        };

        let has_legacy_fields =
            block.contains_key("subAnswerModeEnabled") || block.contains_key("answerTree");
        if !has_legacy_fields {
            continue;
        }

        if should_strip_sub_answer_fields(block, strip_enabled) {
            let removed_mode = block.remove("subAnswerModeEnabled").is_some();
            let removed_tree = block.remove("answerTree").is_some();
            if removed_mode || removed_tree {
                changed = changed.saturating_add(1);
            }
        }
    }

    changed
}

fn sanitize_content_snapshot(snapshot: &mut Value, strip_enabled: bool) -> usize {
    let mut changed = 0usize;

    let Some(root) = snapshot.as_object_mut() else {
        return changed;
    };

    if let Some(reading_passages) = root
        .get_mut("reading")
        .and_then(Value::as_object_mut)
        .and_then(|reading| reading.get_mut("passages"))
        .and_then(Value::as_array_mut)
    {
        for passage in reading_passages {
            if let Some(blocks) = passage
                .as_object_mut()
                .and_then(|object| object.get_mut("blocks"))
                .and_then(Value::as_array_mut)
            {
                changed = changed.saturating_add(sanitize_blocks(blocks, strip_enabled));
            }
        }
    }

    if let Some(listening_parts) = root
        .get_mut("listening")
        .and_then(Value::as_object_mut)
        .and_then(|listening| listening.get_mut("parts"))
        .and_then(Value::as_array_mut)
    {
        for part in listening_parts {
            if let Some(blocks) = part
                .as_object_mut()
                .and_then(|object| object.get_mut("blocks"))
                .and_then(Value::as_array_mut)
            {
                changed = changed.saturating_add(sanitize_blocks(blocks, strip_enabled));
            }
        }
    }

    changed
}

async fn resolve_schedule_version_id(
    pool: &MySqlPool,
    schedule_id: &str,
) -> Result<Option<String>, sqlx::Error> {
    sqlx::query_scalar::<_, String>("SELECT published_version_id FROM exam_schedules WHERE id = ?")
        .bind(schedule_id)
        .fetch_optional(pool)
        .await
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let args = match parse_args() {
        Ok(value) => value,
        Err(message) => {
            eprintln!("{message}");
            std::process::exit(1);
        }
    };

    let database_url = env::var("DATABASE_MIGRATOR_URL")
        .or_else(|_| env::var("DATABASE_DIRECT_URL"))
        .or_else(|_| env::var("DATABASE_URL"))?;

    let pool = MySqlPoolOptions::new()
        .max_connections(2)
        .acquire_timeout(Duration::from_secs(10))
        .connect(&database_url)
        .await?;

    let mut effective_version_id = args.version_id.clone();
    if effective_version_id.is_none() {
        if let Some(schedule_id) = args.schedule_id.as_deref() {
            effective_version_id = resolve_schedule_version_id(&pool, schedule_id).await?;
            if effective_version_id.is_none() {
                println!("No schedule found for id={schedule_id}");
                return Ok(());
            }
        }
    }

    let mut query =
        String::from("SELECT id, exam_id, content_snapshot FROM exam_versions WHERE 1=1");
    if effective_version_id.is_some() {
        query.push_str(" AND id = ?");
    }
    if args.exam_id.is_some() {
        query.push_str(" AND exam_id = ?");
    }

    let mut fetch = sqlx::query(&query);
    if let Some(version_id) = effective_version_id.as_deref() {
        fetch = fetch.bind(version_id);
    }
    if let Some(exam_id) = args.exam_id.as_deref() {
        fetch = fetch.bind(exam_id);
    }

    let rows = fetch.fetch_all(&pool).await?;
    if rows.is_empty() {
        println!("No matching exam_versions rows found.");
        return Ok(());
    }

    let mut changed_versions = 0usize;
    let mut changed_blocks = 0usize;

    for row in rows {
        let version_id: String = row.try_get("id")?;
        let exam_id: String = row.try_get("exam_id")?;
        let mut snapshot: Value = row.try_get("content_snapshot")?;
        let changed_for_version = sanitize_content_snapshot(&mut snapshot, args.strip_enabled);
        if changed_for_version == 0 {
            continue;
        }

        changed_versions = changed_versions.saturating_add(1);
        changed_blocks = changed_blocks.saturating_add(changed_for_version);

        if args.apply {
            sqlx::query(
                "UPDATE exam_versions SET content_snapshot = ?, updated_at = NOW() WHERE id = ?",
            )
            .bind(snapshot)
            .bind(&version_id)
            .execute(&pool)
            .await?;
        }

        let mode = if args.apply { "updated" } else { "dry-run" };
        println!(
            "[{mode}] exam_version id={version_id} exam_id={exam_id} changed_blocks={changed_for_version}"
        );
    }

    if changed_versions == 0 {
        println!("No legacy sub-answer fields matched cleanup criteria.");
        return Ok(());
    }

    println!(
        "Done: changed_versions={changed_versions}, changed_blocks={changed_blocks}, apply={}",
        args.apply
    );

    if !args.apply {
        println!("Dry-run only. Re-run with --apply to persist.");
    }

    Ok(())
}
