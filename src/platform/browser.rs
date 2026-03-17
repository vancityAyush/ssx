use std::process::Command;

use super::detect::Platform;

pub fn open_url(url: &str, platform: Platform) -> Result<(), String> {
    let (cmd, args) = match platform {
        Platform::MacOS => ("open", vec![url]),
        Platform::Linux => ("xdg-open", vec![url]),
        Platform::Wsl => ("wslview", vec![url]),
        Platform::Windows => ("cmd", vec!["/c", "start", url]),
    };

    let status = Command::new(cmd)
        .args(&args)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map_err(|e| format!("Failed to open browser with {cmd}: {e}"))?;

    if status.success() {
        Ok(())
    } else {
        Err(format!("Failed to open URL: {cmd} exited with {status}"))
    }
}
