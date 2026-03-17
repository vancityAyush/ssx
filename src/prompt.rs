use dialoguer::{Confirm, Input, Select};

use crate::providers::Provider;

/// Prompt for provider selection. Returns immediately if `existing` is Some.
pub fn prompt_provider(existing: Option<Provider>) -> Result<Provider, String> {
    if let Some(p) = existing {
        return Ok(p);
    }

    let items: Vec<&str> = Provider::ALL.iter().map(|p| p.display_name()).collect();

    let selection = Select::new()
        .with_prompt("Select a Git provider")
        .items(&items)
        .default(0)
        .interact()
        .map_err(|e| format!("Prompt cancelled: {e}"))?;

    Ok(Provider::ALL[selection])
}

/// Prompt for email. Pre-fills from git config if available.
pub fn prompt_email(existing: Option<String>) -> Result<String, String> {
    if let Some(email) = existing {
        return Ok(email);
    }

    // Try to get default from git config
    let default = get_git_email().unwrap_or_default();

    let mut input = Input::<String>::new().with_prompt("Email address");

    if !default.is_empty() {
        input = input.default(default);
    }

    input
        .validate_with(|input: &String| -> Result<(), String> {
            if input.contains('@') && input.contains('.') {
                Ok(())
            } else {
                Err("Please enter a valid email address".to_string())
            }
        })
        .interact_text()
        .map_err(|e| format!("Prompt cancelled: {e}"))
}

/// Prompt for key name.
pub fn prompt_key_name(existing: Option<String>) -> Result<String, String> {
    if let Some(name) = existing {
        return Ok(name);
    }

    Input::<String>::new()
        .with_prompt("Key name (e.g. personal, work)")
        .validate_with(|input: &String| -> Result<(), String> {
            let trimmed = input.trim();
            if trimmed.is_empty() {
                return Err("Key name cannot be empty".to_string());
            }
            if trimmed.contains(' ') {
                return Err("Key name cannot contain spaces".to_string());
            }
            Ok(())
        })
        .interact_text()
        .map_err(|e| format!("Prompt cancelled: {e}"))
}

/// Prompt for custom hostname.
pub fn prompt_hostname(existing: Option<String>, default: &str) -> Result<String, String> {
    if let Some(host) = existing {
        return Ok(host);
    }

    Input::<String>::new()
        .with_prompt("Hostname")
        .default(default.to_string())
        .interact_text()
        .map_err(|e| format!("Prompt cancelled: {e}"))
}

/// Prompt for confirmation.
pub fn prompt_confirm(message: &str, default: bool) -> Result<bool, String> {
    Confirm::new()
        .with_prompt(message)
        .default(default)
        .interact()
        .map_err(|e| format!("Prompt cancelled: {e}"))
}

/// Prompt for git user name.
pub fn prompt_git_name(existing: Option<String>) -> Result<String, String> {
    if let Some(name) = existing {
        return Ok(name);
    }

    let default = get_git_name().unwrap_or_default();

    let mut input = Input::<String>::new().with_prompt("Git user name");

    if !default.is_empty() {
        input = input.default(default);
    }

    input
        .interact_text()
        .map_err(|e| format!("Prompt cancelled: {e}"))
}

fn get_git_email() -> Option<String> {
    let output = std::process::Command::new("git")
        .args(["config", "--global", "user.email"])
        .output()
        .ok()?;

    if output.status.success() {
        let email = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !email.is_empty() {
            return Some(email);
        }
    }
    None
}

fn get_git_name() -> Option<String> {
    let output = std::process::Command::new("git")
        .args(["config", "--global", "user.name"])
        .output()
        .ok()?;

    if output.status.success() {
        let name = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !name.is_empty() {
            return Some(name);
        }
    }
    None
}
