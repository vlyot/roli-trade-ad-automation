// value_change_detector.rs
// Responsibility: Detect item value changes by comparing against cached values

use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;

/// In-memory cache: catalog_id -> (name, value)
static VALUE_CACHE: Lazy<Mutex<HashMap<u64, (String, u64)>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValueChange {
    pub catalog_id: u64,
    pub name: String,
    pub old_value: u64,
    pub new_value: u64,
    pub thumbnail: Option<String>,
}

/// Detect value changes by comparing fresh inventory against cache.
/// If cache is empty, populate it and return no changes.
pub fn detect_value_changes(enriched_items: &[serde_json::Value]) -> Vec<ValueChange> {
    let mut cache = VALUE_CACHE.lock().unwrap();
    let mut changes = Vec::new();

    // If cache is empty, this is first load - populate cache and return empty
    if cache.is_empty() {
        for item in enriched_items {
            if let (Some(catalog_id), Some(name), Some(value)) = (
                item.get("catalog_id")
                    .and_then(|v| v.as_u64().or_else(|| v.as_str().and_then(|s| s.parse().ok()))),
                item.get("name").and_then(|v| v.as_str()),
                item.get("value").and_then(|v| v.as_u64()),
            ) {
                cache.insert(catalog_id, (name.to_string(), value));
            }
        }
        return changes;
    }

    // Compare current values against cache
    for item in enriched_items {
        let catalog_id = match item.get("catalog_id") {
            Some(v) => v.as_u64().or_else(|| v.as_str().and_then(|s| s.parse().ok())),
            None => None,
        };
        let name = item.get("name").and_then(|v| v.as_str());
        let current_value = item.get("value").and_then(|v| v.as_u64());
        let thumbnail = item.get("thumbnail").and_then(|v| v.as_str()).map(String::from);

        if let (Some(cid), Some(n), Some(cur_val)) = (catalog_id, name, current_value) {
            if let Some((_cached_name, cached_value)) = cache.get(&cid) {
                if *cached_value != cur_val {
                    changes.push(ValueChange {
                        catalog_id: cid,
                        name: n.to_string(),
                        old_value: *cached_value,
                        new_value: cur_val,
                        thumbnail,
                    });
                }
            }
            // Update cache with current value
            cache.insert(cid, (n.to_string(), cur_val));
        }
    }

    changes
}

/// Clear the value cache (for testing purposes)
#[allow(dead_code)]
pub fn clear_cache() {
    let mut cache = VALUE_CACHE.lock().unwrap();
    cache.clear();
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::sync::Mutex;

    // Serialize test execution to avoid cache conflicts
    static TEST_LOCK: Mutex<()> = Mutex::new(());

    #[test]
    fn test_first_load_populates_cache() {
        let _guard = TEST_LOCK.lock().unwrap();
        clear_cache();

        let items = vec![
            json!({
                "catalog_id": 1001,
                "name": "Valkyrie Helm",
                "value": 5000000,
                "thumbnail": "http://example.com/img.png"
            }),
            json!({
                "catalog_id": 1002,
                "name": "Dominus Empyreus",
                "value": 10000000,
            }),
        ];

        let changes = detect_value_changes(&items);

        // First load should return no changes
        assert_eq!(changes.len(), 0);

        // Cache should be populated
        let cache = VALUE_CACHE.lock().unwrap();
        assert_eq!(cache.len(), 2);
        assert_eq!(cache.get(&1001), Some(&("Valkyrie Helm".to_string(), 5000000)));
    }

    #[test]
    fn test_value_change_detected() {
        let _guard = TEST_LOCK.lock().unwrap();
        clear_cache();
        {
            let mut cache = VALUE_CACHE.lock().unwrap();
            cache.insert(2001, ("Test Item".to_string(), 1000000));
        }

        let items = vec![json!({
            "catalog_id": 2001,
            "name": "Test Item",
            "value": 2000000,
            "thumbnail": "http://example.com/test.png"
        })];

        let changes = detect_value_changes(&items);

        assert_eq!(changes.len(), 1);
        assert_eq!(changes[0].catalog_id, 2001);
        assert_eq!(changes[0].name, "Test Item");
        assert_eq!(changes[0].old_value, 1000000);
        assert_eq!(changes[0].new_value, 2000000);
        assert_eq!(changes[0].thumbnail, Some("http://example.com/test.png".to_string()));
    }

    #[test]
    fn test_no_change_returns_empty() {
        let _guard = TEST_LOCK.lock().unwrap();
        clear_cache();
        {
            let mut cache = VALUE_CACHE.lock().unwrap();
            cache.insert(3001, ("Stable Item".to_string(), 500000));
        }

        let items = vec![json!({
            "catalog_id": 3001,
            "name": "Stable Item",
            "value": 500000,
        })];

        let changes = detect_value_changes(&items);
        assert_eq!(changes.len(), 0);
    }

    #[test]
    fn test_catalog_id_as_string() {
        let _guard = TEST_LOCK.lock().unwrap();
        clear_cache();

        let items = vec![json!({
            "catalog_id": "4001",
            "name": "String ID Item",
            "value": 750000,
        })];

        let changes = detect_value_changes(&items);
        assert_eq!(changes.len(), 0);

        let cache = VALUE_CACHE.lock().unwrap();
        assert!(cache.contains_key(&4001));
    }

    #[test]
    fn test_integration_full_notification_flow() {
        let _guard = TEST_LOCK.lock().unwrap();
        clear_cache();

        // Simulate first inventory load
        let first_load = vec![
            json!({
                "catalog_id": 5001,
                "name": "Valkyrie Helm",
                "value": 7000000,
                "thumbnail": "http://example.com/valkyrie.png"
            }),
            json!({
                "catalog_id": 5002,
                "name": "Sparkle Time Fedora",
                "value": 15000000,
            }),
        ];

        let changes = detect_value_changes(&first_load);
        assert_eq!(changes.len(), 0, "First load should not produce any changes");

        // Simulate second load with value changes
        let second_load = vec![
            json!({
                "catalog_id": 5001,
                "name": "Valkyrie Helm",
                "value": 6000000, // Decreased
                "thumbnail": "http://example.com/valkyrie.png"
            }),
            json!({
                "catalog_id": 5002,
                "name": "Sparkle Time Fedora",
                "value": 16000000, // Increased
            }),
        ];

        let changes = detect_value_changes(&second_load);
        assert_eq!(changes.len(), 2, "Should detect both value changes");

        // Verify first change (decrease)
        assert_eq!(changes[0].catalog_id, 5001);
        assert_eq!(changes[0].name, "Valkyrie Helm");
        assert_eq!(changes[0].old_value, 7000000);
        assert_eq!(changes[0].new_value, 6000000);
        assert_eq!(changes[0].thumbnail, Some("http://example.com/valkyrie.png".to_string()));

        // Verify second change (increase)
        assert_eq!(changes[1].catalog_id, 5002);
        assert_eq!(changes[1].name, "Sparkle Time Fedora");
        assert_eq!(changes[1].old_value, 15000000);
        assert_eq!(changes[1].new_value, 16000000);

        // Simulate third load with no changes
        let third_load = vec![
            json!({
                "catalog_id": 5001,
                "name": "Valkyrie Helm",
                "value": 6000000,
            }),
            json!({
                "catalog_id": 5002,
                "name": "Sparkle Time Fedora",
                "value": 16000000,
            }),
        ];

        let changes = detect_value_changes(&third_load);
        assert_eq!(changes.len(), 0, "No changes should be detected when values are stable");
    }
}
