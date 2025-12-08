// notification_settings.rs
// Responsibility: Store and retrieve user notification preferences

use dirs::data_local_dir;
use rusqlite::{params, Connection, OptionalExtension};
use std::sync::Mutex;

static SETTINGS_DB: Mutex<Option<Connection>> = Mutex::new(None);

fn get_db_connection() -> Result<&'static Mutex<Option<Connection>>, String> {
    let mut lock = SETTINGS_DB.lock().map_err(|e| e.to_string())?;

    if lock.is_none() {
        let mut dir = data_local_dir().ok_or("Could not determine data directory")?;
        dir.push("roli-trade-ad-automation");
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        dir.push("notification_settings.db");

        let conn = Connection::open(&dir).map_err(|e| e.to_string())?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS notification_settings (
                user_id TEXT PRIMARY KEY,
                enabled INTEGER NOT NULL DEFAULT 0
            )",
            [],
        )
        .map_err(|e| e.to_string())?;

        *lock = Some(conn);
    }

    drop(lock);
    Ok(&SETTINGS_DB)
}

/// Get notification setting for user (default: false)
pub fn get_notification_enabled(user_id: &str) -> Result<bool, String> {
    let db = get_db_connection()?;
    let lock = db.lock().map_err(|e| e.to_string())?;
    let conn = lock.as_ref().ok_or("Database not initialized")?;

    let mut stmt = conn
        .prepare("SELECT enabled FROM notification_settings WHERE user_id = ?1")
        .map_err(|e| e.to_string())?;

    let result = stmt
        .query_row(params![user_id], |row| row.get::<_, i32>(0))
        .optional()
        .map_err(|e| e.to_string())?;

    Ok(result.unwrap_or(0) != 0)
}

/// Set notification setting for user
pub fn set_notification_enabled(user_id: &str, enabled: bool) -> Result<(), String> {
    let db = get_db_connection()?;
    let lock = db.lock().map_err(|e| e.to_string())?;
    let conn = lock.as_ref().ok_or("Database not initialized")?;

    conn.execute(
        "INSERT OR REPLACE INTO notification_settings (user_id, enabled) VALUES (?1, ?2)",
        params![user_id, if enabled { 1 } else { 0 }],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_disabled() {
        let result = get_notification_enabled("test_user_1");
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), false);
    }

    #[test]
    fn test_enable_notifications() {
        let user_id = "test_user_2";

        let result = set_notification_enabled(user_id, true);
        assert!(result.is_ok());

        let enabled = get_notification_enabled(user_id).unwrap();
        assert_eq!(enabled, true);
    }

    #[test]
    fn test_disable_notifications() {
        let user_id = "test_user_3";

        set_notification_enabled(user_id, true).unwrap();
        set_notification_enabled(user_id, false).unwrap();

        let enabled = get_notification_enabled(user_id).unwrap();
        assert_eq!(enabled, false);
    }

    #[test]
    fn test_toggle_notifications() {
        let user_id = "test_user_4";

        set_notification_enabled(user_id, true).unwrap();
        assert_eq!(get_notification_enabled(user_id).unwrap(), true);

        set_notification_enabled(user_id, false).unwrap();
        assert_eq!(get_notification_enabled(user_id).unwrap(), false);

        set_notification_enabled(user_id, true).unwrap();
        assert_eq!(get_notification_enabled(user_id).unwrap(), true);
    }

    #[test]
    fn test_multiple_users_independent_settings() {
        let user1 = "1426170901"; // Simulating numeric user_id as string
        let user2 = "9876543210";

        // Set different preferences for different users
        set_notification_enabled(user1, true).unwrap();
        set_notification_enabled(user2, false).unwrap();

        // Verify they're independent
        assert_eq!(get_notification_enabled(user1).unwrap(), true);
        assert_eq!(get_notification_enabled(user2).unwrap(), false);

        // Change one user's setting
        set_notification_enabled(user1, false).unwrap();

        // Verify the other user is unaffected
        assert_eq!(get_notification_enabled(user1).unwrap(), false);
        assert_eq!(get_notification_enabled(user2).unwrap(), false);

        // Enable for second user
        set_notification_enabled(user2, true).unwrap();
        assert_eq!(get_notification_enabled(user1).unwrap(), false);
        assert_eq!(get_notification_enabled(user2).unwrap(), true);
    }
}
