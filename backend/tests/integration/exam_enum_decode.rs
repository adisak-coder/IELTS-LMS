#[path = "../support/mysql.rs"]
mod mysql;

use std::{env, net::TcpStream, time::Duration};

use ielts_backend_domain::exam::{ExamEventAction, MembershipRole};

#[tokio::test]
async fn exam_enums_decode_and_encode_as_text() {
    if env::var("TEST_DATABASE_URL").is_err()
        && TcpStream::connect_timeout(
            &"127.0.0.1:4000".parse().expect("socket addr"),
            Duration::from_secs(1),
        )
        .is_err()
    {
        eprintln!("Skipping: no TEST_DATABASE_URL and no local MySQL/TiDB on 127.0.0.1:4000");
        return;
    }

    let database = mysql::TestDatabase::new(&[]).await;
    let pool = database.pool();

    for (raw, expected) in [
        ("created", ExamEventAction::Created),
        ("draft_saved", ExamEventAction::DraftSaved),
        ("submitted_for_review", ExamEventAction::SubmittedForReview),
        ("approved", ExamEventAction::Approved),
        ("rejected", ExamEventAction::Rejected),
        ("published", ExamEventAction::Published),
        ("unpublished", ExamEventAction::Unpublished),
        ("scheduled", ExamEventAction::Scheduled),
        ("archived", ExamEventAction::Archived),
        ("restored", ExamEventAction::Restored),
        ("cloned", ExamEventAction::Cloned),
        ("version_created", ExamEventAction::VersionCreated),
        ("version_restored", ExamEventAction::VersionRestored),
        ("permissions_updated", ExamEventAction::PermissionsUpdated),
    ] {
        let decoded: ExamEventAction =
            sqlx::query_scalar::<_, ExamEventAction>(&format!("SELECT '{raw}'"))
                .fetch_one(pool)
                .await
                .expect("decode exam event action");
        assert_eq!(decoded, expected);

        let encoded: String = sqlx::query_scalar("SELECT ?")
            .bind(expected.clone())
            .fetch_one(pool)
            .await
            .expect("encode exam event action");
        assert_eq!(encoded, raw);
    }

    for (raw, expected) in [
        ("owner", MembershipRole::Owner),
        ("reviewer", MembershipRole::Reviewer),
        ("grader", MembershipRole::Grader),
    ] {
        let decoded: MembershipRole =
            sqlx::query_scalar::<_, MembershipRole>(&format!("SELECT '{raw}'"))
                .fetch_one(pool)
                .await
                .expect("decode membership role");
        assert_eq!(decoded, expected);

        let encoded: String = sqlx::query_scalar("SELECT ?")
            .bind(expected.clone())
            .fetch_one(pool)
            .await
            .expect("encode membership role");
        assert_eq!(encoded, raw);
    }

    database.shutdown().await;
}
