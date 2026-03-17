use std::process::Command;

/// Test SSH connection to a host. Returns (success, output_message).
/// Note: Git SSH servers return exit code 1 on successful auth (they reject shell access).
pub fn test_connection(host: &str) -> (bool, String) {
    let target = if host.contains('@') {
        host.to_string()
    } else {
        format!("git@{host}")
    };

    let output = Command::new("ssh")
        .args(["-T", "-o", "StrictHostKeyChecking=accept-new", &target])
        .output();

    match output {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            let combined = format!("{stdout}{stderr}");

            // Filter Azure DevOps noise
            let filtered: String = combined
                .lines()
                .filter(|line| {
                    !line.contains("shell request failed")
                        && !line.contains("PTY allocation request failed")
                })
                .collect::<Vec<_>>()
                .join("\n");

            // Git SSH returns exit code 1 on successful authentication
            let exit_code = output.status.code().unwrap_or(-1);
            let success = exit_code == 0
                || exit_code == 1
                    && (combined.contains("successfully authenticated")
                        || combined.contains("logged in as")
                        || combined.contains("Welcome to GitLab")
                        || combined.contains("You can use git")
                        || combined.contains("conq:"));

            (success, filtered.trim().to_string())
        }
        Err(e) => (false, format!("Failed to run ssh: {e}")),
    }
}
