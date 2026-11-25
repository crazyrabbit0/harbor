//! Lenient serde readers for replies relayed from other processes and APIs: a field of the wrong JSON type reads as its default.

use serde::de::{DeserializeOwned, Deserializer};
use serde::Deserialize;
use serde_json::Value;

/// Reads a reply object into `T`; anything but an object reads as `T::default()`.
pub fn object<T: DeserializeOwned + Default>(value: Value) -> T {
    if value.is_object() {
        T::deserialize(value).unwrap_or_default()
    } else {
        T::default()
    }
}

/// Field reader: a value that does not fit `T` reads as `T::default()`.
pub fn value<'de, D: Deserializer<'de>, T: DeserializeOwned + Default>(
    deserializer: D,
) -> Result<T, D::Error> {
    Ok(T::deserialize(Value::deserialize(deserializer)?).unwrap_or_default())
}

/// Field reader for arrays: anything but an array reads as empty; elements that do not fit `T` are dropped.
pub fn list<'de, D: Deserializer<'de>, T: DeserializeOwned>(
    deserializer: D,
) -> Result<Vec<T>, D::Error> {
    Ok(match Value::deserialize(deserializer)? {
        Value::Array(items) => items
            .into_iter()
            .filter_map(|item| T::deserialize(item).ok())
            .collect(),
        _ => Vec::new(),
    })
}

/// Field reader for arrays of objects: anything but an array reads as `None`; each element reads through `object`.
pub fn objects<'de, D: Deserializer<'de>, T: DeserializeOwned + Default>(
    deserializer: D,
) -> Result<Option<Vec<T>>, D::Error> {
    Ok(match Value::deserialize(deserializer)? {
        Value::Array(items) => Some(items.into_iter().map(object).collect()),
        _ => None,
    })
}

/// Field reader that keeps a present `null` (`Some(None)`) apart from an absent field (`None`); a wrong type reads as absent.
pub fn present<'de, D: Deserializer<'de>, T: DeserializeOwned>(
    deserializer: D,
) -> Result<Option<Option<T>>, D::Error> {
    Ok(Option::<T>::deserialize(Value::deserialize(deserializer)?).ok())
}
