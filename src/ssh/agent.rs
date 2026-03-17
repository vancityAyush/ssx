use std::path::Path;
use std::process::Command;

use crate::platform::Platform;

/// Ensure ssh-agent is running and add a key to it.
pub fn add_key(key_path: &Path, platform: Platform) -> Result<(), String> {
    ensure_agent_running(platform)?;

    let mut cmd = Command::new("ssh-add");

    // macOS: use Apple keychain integration
    if platform == Platform::MacOS {
        cmd.arg("--apple-use-keychain");
    }

    cmd.arg(key_path);

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to run ssh-add: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // ssh-add may complain about keychain on older macOS, try without
        if platform == Platform::MacOS && stderr.contains("apple-use-keychain") {
            let output2 = Command::new("ssh-add")
                .arg(key_path)
                .output()
                .map_err(|e| format!("Failed to run ssh-add: {e}"))?;
            if !output2.status.success() {
                let stderr2 = String::from_utf8_lossy(&output2.stderr);
                return Err(format!("ssh-add failed: {stderr2}"));
            }
            return Ok(());
        }
        return Err(format!("ssh-add failed: {stderr}"));
    }

    Ok(())
}

/// Remove a key from the agent.
pub fn remove_key(key_path: &Path) -> Result<(), String> {
    let output = Command::new("ssh-add")
        .arg("-d")
        .arg(key_path)
        .output()
        .map_err(|e| format!("Failed to run ssh-add -d: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ssh-add -d failed: {stderr}"));
    }

    Ok(())
}

/// List keys currently loaded in the agent.
pub fn list_keys() -> Result<String, String> {
    let output = Command::new("ssh-add")
        .arg("-l")
        .output()
        .map_err(|e| format!("Failed to run ssh-add -l: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();

    // Exit code 1 with "no identities" is not an error
    if !output.status.success() {
        if stdout.contains("no identities") || stdout.contains("The agent has no identities") {
            return Ok("No keys loaded in the SSH agent.".to_string());
        }
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ssh-add -l failed: {stderr}"));
    }

    Ok(stdout)
}

fn ensure_agent_running(platform: Platform) -> Result<(), String> {
    match platform {
        Platform::Windows => {
            // On Windows, try to start the ssh-agent service
            let _ = Command::new("powershell")
                .args([
                    "-Command",
                    "Start-Service ssh-agent -ErrorAction SilentlyContinue",
                ])
                .output();
            Ok(())
        }
        _ => {
            // On Unix, check SSH_AUTH_SOCK
            if std::env::var("SSH_AUTH_SOCK").is_ok() {
                return Ok(());
            }

            // Try to start ssh-agent
            let output = Command::new("ssh-agent")
                .arg("-s")
                .output()
                .map_err(|e| format!("Failed to start ssh-agent: {e}"))?;

            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let mut env_cmds = Vec::new();

                // Parse SSH_AUTH_SOCK from output
                for line in stdout.lines() {
                    if let Some(sock) = line.strip_prefix("SSH_AUTH_SOCK=") {
                        if let Some(sock) = sock.strip_suffix("; export SSH_AUTH_SOCK;") {
                            std::env::set_var("SSH_AUTH_SOCK", sock);
                            env_cmds.push(format!("export SSH_AUTH_SOCK={}", sock));
                        }
                    }
                    if let Some(pid) = line.strip_prefix("SSH_AGENT_PID=") {
                        if let Some(pid) = pid.strip_suffix("; export SSH_AGENT_PID;") {
                            std::env::set_var("SSH_AGENT_PID", pid);
                            env_cmds.push(format!("export SSH_AGENT_PID={}", pid));
                        }
                    }
                }

                if let Ok(env_file) = std::env::var("SSHX_ENV_FILE") {
                    if !env_cmds.is_empty() {
                        use std::io::Write;
                        if let Ok(mut file) = std::fs::OpenOptions::new()
                            .append(true)
                            .create(true)
                            .open(env_file)
                        {
                            for cmd in env_cmds {
                                let _ = writeln!(file, "{}", cmd);
                            }
                        }
                    }
                }
            }

            Ok(())
        }
    }
}
