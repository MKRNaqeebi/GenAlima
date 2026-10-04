//! Trigger items: parsing, the `--field` coercion rules and the skeleton command.
//!
//! Mirrors the run dialog's *Fields* view and `parseTriggerItems` in
//! `frontend/src/components/Workflows/types.ts`, including its message strings,
//! so the CLI and the UI reject the same input for the same reason.

use crate::error::{CliError, Result};
use crate::model::{Contract, FieldSpec, WorkflowFile};
use serde_json::{Number, Value};

/// A JSON list whose every element is an object with an object `json`.
pub fn parse_items(text: &str) -> Result<Vec<Value>> {
    let value: Value = serde_json::from_str(text)
        .map_err(|error| CliError::usage(format!("could not parse items: {error}")))?;
    let Value::Array(items) = value else {
        return Err(CliError::usage("Must be a JSON list of items."));
    };
    for (index, item) in items.iter().enumerate() {
        let object = item.as_object();
        if object.is_none() || item["json"].as_object().is_none() {
            return Err(CliError::usage(format!(
                "Item {index} needs a \"json\" object."
            )));
        }
    }
    Ok(items)
}

/// The contract the run's entry items must satisfy: the single node with no
/// inbound edge, which is also the node the run dialog builds its form from.
pub fn entry_contract(workflow: &WorkflowFile) -> Contract {
    let entry = workflow
        .nodes
        .iter()
        .filter(|node| {
            !workflow
                .edges
                .iter()
                .any(|edge| edge.target_node_id == node.id.unwrap_or_default())
        })
        .collect::<Vec<_>>();
    if entry.len() == 1 {
        entry[0].input.clone()
    } else {
        Contract::new()
    }
}

/// A ready-to-edit `[{"json": {…}}]` derived from the entry node's contract,
/// with declared defaults filled in.
pub fn skeleton(workflow: &WorkflowFile) -> Vec<Value> {
    let contract = entry_contract(workflow);
    let mut json = serde_json::Map::new();
    for (field, spec) in &contract {
        json.insert(field.clone(), skeleton_value(spec));
    }
    vec![serde_json::json!({ "json": json })]
}

fn skeleton_value(spec: &FieldSpec) -> Value {
    if !spec.default.is_null() {
        return spec.default.clone();
    }
    match spec.field_type.as_str() {
        "int" => Value::Number(Number::from(0)),
        "float" => Value::Number(Number::from_f64(0.0).unwrap_or_else(|| Number::from(0))),
        "bool" => Value::Bool(false),
        "list" => Value::Array(Vec::new()),
        "dict" => Value::Object(serde_json::Map::new()),
        _ => Value::String(String::new()),
    }
}

/// Build one item from repeated `key=value` flags, applying the declared types.
pub fn build_item(fields: &[(String, String)], contract: &Contract) -> Result<Value> {
    let mut json = serde_json::Map::new();
    for (field, spec) in contract {
        let provided = fields
            .iter()
            .find(|(name, _)| name == field)
            .map(|(_, value)| value.clone());
        match provided {
            Some(text) if !text.is_empty() => {
                json.insert(field.clone(), coerce(&text, spec)?);
            }
            _ if spec.is_required() => {
                return Err(CliError::usage(format!(
                    "field '{field}': This field is required."
                )))
            }
            _ => {}
        }
    }
    // Fields the contract does not declare still travel: the server accepts any
    // extra key, and a hidden field is more useful than a rejected run.
    for (name, value) in fields {
        if !contract.contains_key(name) {
            json.insert(
                name.clone(),
                serde_json::from_str(value).unwrap_or_else(|_| Value::String(value.clone())),
            );
        }
    }
    Ok(serde_json::json!({ "json": json }))
}

/// Mirror of the dialog's `coerceField`.
pub fn coerce(text: &str, spec: &FieldSpec) -> Result<Value> {
    let value = match spec.field_type.as_str() {
        "int" => {
            let parsed: i64 = text
                .trim()
                .parse()
                .map_err(|_| CliError::usage(format!("Expected an integer, got {text:?}.")))?;
            Value::Number(Number::from(parsed))
        }
        "float" => {
            let parsed: f64 = text
                .trim()
                .parse()
                .map_err(|_| CliError::usage(format!("Expected a number, got {text:?}.")))?;
            Value::Number(Number::from_f64(parsed).ok_or_else(|| {
                CliError::usage(format!("Expected a finite number, got {text:?}."))
            })?)
        }
        "bool" => match text.trim() {
            "true" => Value::Bool(true),
            "false" => Value::Bool(false),
            other => {
                return Err(CliError::usage(format!(
                    "Expected true or false, got {other:?}."
                )))
            }
        },
        "list" | "dict" | "Any" => {
            let parsed: Value = serde_json::from_str(text)
                .map_err(|error| CliError::usage(format!("field expects JSON: {error}")))?;
            if let Some(items) = &spec.items {
                if let Value::Array(values) = &parsed {
                    for element in values {
                        if type_name(element) != items.as_str() && items != "Any" {
                            return Err(CliError::usage(format!(
                                "expected list of {items}, got list containing {}",
                                type_name(element)
                            )));
                        }
                    }
                }
            }
            parsed
        }
        _ => Value::String(text.to_string()),
    };

    if let Some(enum_values) = &spec.enum_values {
        if !enum_values.iter().any(|candidate| candidate == &value) {
            return Err(CliError::usage(format!(
                "Choose one of the listed values: {}.",
                enum_values
                    .iter()
                    .map(|candidate| candidate.to_string())
                    .collect::<Vec<_>>()
                    .join(", ")
            )));
        }
    }
    Ok(value)
}

fn type_name(value: &Value) -> &'static str {
    match value {
        Value::Null => "null",
        Value::Bool(_) => "bool",
        Value::Number(number) if number.is_i64() || number.is_u64() => "int",
        Value::Number(_) => "float",
        Value::String(_) => "str",
        Value::Array(_) => "list",
        Value::Object(_) => "dict",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::Node;

    fn workflow_with_entry() -> WorkflowFile {
        let mut workflow = WorkflowFile::blank("Demo");
        let mut entry = Node::new("code_1", "Fetch", (0.0, 0.0));
        let mut date = FieldSpec::typed("str");
        date.required = Some(true);
        let mut count = FieldSpec::typed("int");
        count.default = serde_json::json!(1);
        count.required = Some(false);
        entry.input.insert("date".into(), date);
        entry.input.insert("count".into(), count);
        workflow.nodes.push(entry);
        workflow
    }

    #[test]
    fn items_must_be_a_list_of_json_objects() {
        assert!(parse_items("[]").unwrap().is_empty());
        assert!(parse_items("{}").is_err());
        let error = parse_items("[{\"a\":1}]").unwrap_err();
        assert_eq!(error.message(), "Item 0 needs a \"json\" object.");
        let error = parse_items("not json").unwrap_err();
        assert!(error.message().contains("could not parse items"));
    }

    #[test]
    fn the_skeleton_follows_the_entry_contract() {
        let workflow = workflow_with_entry();
        let skeleton = skeleton(&workflow);
        assert_eq!(skeleton[0]["json"]["date"], "");
        assert_eq!(skeleton[0]["json"]["count"], 1);
    }

    #[test]
    fn declared_types_coerce_and_a_missing_required_field_fails() {
        let contract = entry_contract(&workflow_with_entry());
        let error = build_item(&[("count".into(), "2".into())], &contract).unwrap_err();
        assert!(error.message().contains("'date': This field is required."));

        let item = build_item(
            &[
                ("date".into(), "2025-01-01".into()),
                ("count".into(), "2".into()),
            ],
            &contract,
        )
        .unwrap();
        assert_eq!(item["json"]["date"], "2025-01-01");
        assert_eq!(item["json"]["count"], 2);
    }

    #[test]
    fn coercion_messages_match_the_dialog() {
        let int = FieldSpec::typed("int");
        assert!(coerce("x", &int)
            .unwrap_err()
            .message()
            .contains("Expected an integer, got \"x\"."));
        let float = FieldSpec::typed("float");
        assert!(coerce("x", &float)
            .unwrap_err()
            .message()
            .contains("Expected a number, got \"x\"."));
        let boolean = FieldSpec::typed("bool");
        assert!(coerce("yes", &boolean).is_err());
        assert_eq!(coerce("true", &boolean).unwrap(), Value::Bool(true));
    }

    #[test]
    fn list_element_types_are_checked() {
        let mut spec = FieldSpec::typed("list");
        spec.items = Some("str".to_string());
        assert!(coerce("[\"a\",\"b\"]", &spec).is_ok());
        assert!(coerce("[\"a\",1]", &spec)
            .unwrap_err()
            .message()
            .contains("list containing int"));
    }

    #[test]
    fn enum_membership_is_enforced() {
        let mut spec = FieldSpec::typed("str");
        spec.enum_values = Some(vec![serde_json::json!("a"), serde_json::json!("b")]);
        assert!(coerce("c", &spec).is_err());
        assert!(coerce("a", &spec).is_ok());
    }

    #[test]
    fn undeclared_fields_still_travel() {
        let contract = Contract::new();
        let item = build_item(&[("extra".into(), "1".into())], &contract).unwrap();
        assert_eq!(item["json"]["extra"], 1);
    }
}
