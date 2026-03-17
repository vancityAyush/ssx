use std::io::Write;
use std::process::{Command, Stdio};

use super::detect::Platform;

pub fn copy_to_clipboard(text: &str, platform: Platform) -> Result<(), String> {
    let (cmd, args) = match platform {
        Platform::MacOS => ("pbcopy", vec![]),
        Platform::Wsl => ("clip.exe", vec![]),
        Platform::Windows => ("clip.exe", vec![]),
        Platform::Linux => {
            if which::which("xclip").is_ok() {
                ("xclip", vec!["-selection", "clipboard"])
            } else if which::which("xsel").is_ok() {
                ("xsel", vec!["--clipboard", "--input"])
            } else {
                return Err("No clipboard utility found. Install xclip or xsel.".to_string());
            }
        }
    };

    let mut child = Command::new(cmd)
        .args(&args)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to run {cmd}: {e}"))?;

    if let Some(ref mut stdin) = child.stdin {
        stdin
            .write_all(text.as_bytes())
            .map_err(|e| format!("Failed to write to clipboard: {e}"))?;
    }

    let status = child
        .wait()
        .map_err(|e| format!("Failed to wait for clipboard command: {e}"))?;

    if status.success() {
        Ok(())
    } else {
        Err(format!("{cmd} exited with status {status}"))
    }
}
