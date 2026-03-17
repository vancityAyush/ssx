use std::path::{Path, PathBuf};
use std::process::Command;

use crate::providers::KeyType;

#[allow(dead_code)]
pub struct KeyPair {
    pub private_key: PathBuf,
    pub public_key: PathBuf,
}

pub fn generate_key(
    ssh_dir: &Path,
    key_name: &str,
    email: &str,
    key_type: KeyType,
) -> Result<KeyPair, String> {
    let private_key = ssh_dir.join(key_name);
    let public_key = ssh_dir.join(format!("{key_name}.pub"));

    let mut args = vec![
        "-t".to_string(),
        key_type.algorithm().to_string(),
        "-C".to_string(),
        email.to_string(),
        "-f".to_string(),
        private_key.to_string_lossy().to_string(),
        "-N".to_string(),
        String::new(), // empty passphrase
    ];

    if let Some(bits) = key_type.bits() {
        args.push("-b".to_string());
        args.push(bits.to_string());
    }

    let output = Command::new("ssh-keygen")
        .args(&args)
        .output()
        .map_err(|e| format!("Failed to run ssh-keygen: {e}"))?;

    if !output.status.success() {
        // Cleanup partial files on failure
        let _ = std::fs::remove_file(&private_key);
        let _ = std::fs::remove_file(&public_key);
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ssh-keygen failed: {stderr}"));
    }

    Ok(KeyPair {
        private_key,
        public_key,
    })
}

pub fn key_exists(ssh_dir: &Path, key_name: &str) -> bool {
    ssh_dir.join(key_name).exists()
}

pub fn read_public_key(ssh_dir: &Path, key_name: &str) -> Result<String, String> {
    let pub_path = ssh_dir.join(format!("{key_name}.pub"));
    std::fs::read_to_string(&pub_path)
        .map(|s| s.trim().to_string())
        .map_err(|e| format!("Failed to read {}: {e}", pub_path.display()))
}

pub fn remove_key_files(ssh_dir: &Path, key_name: &str) -> Result<(), String> {
    let private_key = ssh_dir.join(key_name);
    let public_key = ssh_dir.join(format!("{key_name}.pub"));

    let mut errors = Vec::new();

    if private_key.exists() {
        if let Err(e) = std::fs::remove_file(&private_key) {
            errors.push(format!("Failed to remove {}: {e}", private_key.display()));
        }
    }

    if public_key.exists() {
        if let Err(e) = std::fs::remove_file(&public_key) {
            errors.push(format!("Failed to remove {}: {e}", public_key.display()));
        }
    }

    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors.join("; "))
    }
}
