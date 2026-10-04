//! Authentication: the OAuth2 password grant, local token storage, and the
//! local decode of the JWT's `exp`.
//!
//! The token is an HS256 JWT with an 8-day expiry and **no refresh token**
//! (`app/core/config.py:46`), and the API has no revocation endpoint, so
//! `logout` is local-only — the same thing the web UI's logout does.

use crate::api::Api;
use crate::config::Config;
use crate::error::{CliError, Result};
use serde_json::Value;
use time::OffsetDateTime;

#[derive(Debug, Clone, PartialEq)]
pub enum TokenState {
    /// More than a day left.
    Valid {
        expires: OffsetDateTime,
    },
    /// Less than a day left.
    Expiring {
        expires: OffsetDateTime,
    },
    Expired {
        expires: OffsetDateTime,
    },
    /// Not a JWT, or no `exp` claim: the server may still accept it.
    Unknown,
}

/// Exchange credentials for a token. The endpoint is form-encoded, exactly as
/// the login page calls it.
pub fn login(server: &str, email: &str, password: &str, timeout: Option<u64>) -> Result<String> {
    let api = Api::new(server, None, timeout.unwrap_or(30));
    let response = api.login(email, password)?;
    response
        .get("access_token")
        .and_then(Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| CliError::internal("the login response had no access_token"))
}

pub fn logout(config: &Config) -> Result<bool> {
    config.clear_token()
}

/// The decoded payload of a JWT, without any signature verification. The CLI
/// only uses this for its own expiry warning and must never imply otherwise.
pub fn decode_payload(token: &str) -> Option<Value> {
    let mut parts = token.split('.');
    let _header = parts.next()?;
    let payload = parts.next()?;
    let bytes = base64url_decode(payload)?;
    serde_json::from_slice(&bytes).ok()
}

pub fn token_state(token: &str) -> TokenState {
    let Some(payload) = decode_payload(token) else {
        return TokenState::Unknown;
    };
    let Some(exp) = payload.get("exp").and_then(Value::as_i64) else {
        return TokenState::Unknown;
    };
    let Ok(expires) = OffsetDateTime::from_unix_timestamp(exp) else {
        return TokenState::Unknown;
    };
    let remaining = expires - OffsetDateTime::now_utc();
    if remaining.is_negative() {
        TokenState::Expired { expires }
    } else if remaining.whole_hours() < 24 {
        TokenState::Expiring { expires }
    } else {
        TokenState::Valid { expires }
    }
}

/// Fail before sending a request the server would answer with 403 anyway.
pub fn check_token_freshness(token: &str) -> Result<()> {
    if let TokenState::Expired { expires } = token_state(token) {
        return Err(CliError::unauthorized(format!(
            "the stored token expired at {} (UTC)",
            expires
                .format(&time::format_description::well_known::Rfc3339)
                .unwrap_or_else(|_| "an unknown time".to_string())
        ))
        .with_hint("run `genalima login` again"));
    }
    if let TokenState::Expiring { expires } = token_state(token) {
        crate::globals::warn(&format!(
            "the token expires at {} (UTC)",
            expires
                .format(&time::format_description::well_known::Rfc3339)
                .unwrap_or_else(|_| "an unknown time".to_string())
        ));
    }
    Ok(())
}

/// `eyJhbGci…` → `eyJhbGci…(redacted)`, for `--verbose` traces and errors.
pub fn redact(token: &str) -> String {
    if token.len() <= 12 {
        return "***".to_string();
    }
    format!("{}…(redacted)", &token[..8])
}

fn base64url_decode(input: &str) -> Option<Vec<u8>> {
    let mut alphabet = [0u8; 256];
    for (index, byte) in b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
        .iter()
        .enumerate()
    {
        alphabet[*byte as usize] = index as u8;
    }
    let mut bits = 0u32;
    let mut bit_count = 0u32;
    let mut output = Vec::with_capacity(input.len() * 3 / 4);
    for byte in input.bytes() {
        if byte == b'=' {
            break;
        }
        let value = alphabet[byte as usize];
        if byte != b'-' && byte != b'_' && !byte.is_ascii_alphanumeric() {
            return None;
        }
        bits = (bits << 6) | value as u32;
        bit_count += 6;
        if bit_count >= 8 {
            bit_count -= 8;
            output.push((bits >> bit_count) as u8);
        }
    }
    Some(output)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn token_with_exp(exp: i64) -> String {
        let payload = serde_json::json!({ "exp": exp, "sub": "abc" });
        let encoded = base64url_encode(payload.to_string().as_bytes());
        format!("header.{encoded}.signature")
    }

    fn base64url_encode(input: &[u8]) -> String {
        const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
        let mut output = String::new();
        for chunk in input.chunks(3) {
            let b = [
                chunk[0],
                *chunk.get(1).unwrap_or(&0),
                *chunk.get(2).unwrap_or(&0),
            ];
            let triple = ((b[0] as u32) << 16) | ((b[1] as u32) << 8) | b[2] as u32;
            output.push(ALPHABET[(triple >> 18) as usize & 63] as char);
            output.push(ALPHABET[(triple >> 12) as usize & 63] as char);
            if chunk.len() > 1 {
                output.push(ALPHABET[(triple >> 6) as usize & 63] as char);
            }
            if chunk.len() > 2 {
                output.push(ALPHABET[triple as usize & 63] as char);
            }
        }
        output
    }

    #[test]
    fn decodes_a_payload_without_verifying_it() {
        let token = token_with_exp(4_000_000_000);
        let payload = decode_payload(&token).unwrap();
        assert_eq!(payload["sub"], "abc");
    }

    #[test]
    fn future_and_past_expiries_are_classified() {
        let soon = OffsetDateTime::now_utc() + time::Duration::hours(2);
        assert!(matches!(
            token_state(&token_with_exp(soon.unix_timestamp())),
            TokenState::Expiring { .. }
        ));
        let long = OffsetDateTime::now_utc() + time::Duration::days(5);
        assert!(matches!(
            token_state(&token_with_exp(long.unix_timestamp())),
            TokenState::Valid { .. }
        ));
        let past = OffsetDateTime::now_utc() - time::Duration::hours(1);
        assert!(matches!(
            token_state(&token_with_exp(past.unix_timestamp())),
            TokenState::Expired { .. }
        ));
    }

    #[test]
    fn an_expired_token_fails_before_the_request() {
        let past = OffsetDateTime::now_utc() - time::Duration::hours(3);
        let error = check_token_freshness(&token_with_exp(past.unix_timestamp())).unwrap_err();
        assert_eq!(error.exit_code(), crate::error::EXIT_UNAUTHORIZED);
    }

    #[test]
    fn a_garbage_token_is_unknown_not_expired() {
        assert_eq!(token_state("not-a-jwt"), TokenState::Unknown);
        assert!(check_token_freshness("not-a-jwt").is_ok());
    }

    #[test]
    fn redaction_hides_the_body() {
        let redacted = redact("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature");
        assert!(!redacted.contains("payload"));
        assert!(redacted.contains("redacted"));
    }
}
