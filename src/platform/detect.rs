use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Platform {
    MacOS,
    Linux,
    Windows,
    Wsl,
}

impl Platform {
    pub fn detect() -> Platform {
        if cfg!(target_os = "windows") {
            return Platform::Windows;
        }

        if cfg!(target_os = "linux") {
            // Check for WSL
            if let Ok(contents) = std::fs::read_to_string("/proc/version") {
                let lower = contents.to_lowercase();
                if lower.contains("microsoft") || lower.contains("wsl") {
                    return Platform::Wsl;
                }
            }
            return Platform::Linux;
        }

        if cfg!(target_os = "macos") {
            return Platform::MacOS;
        }

        // Fallback to Linux for other Unix-like systems
        Platform::Linux
    }

    #[allow(dead_code)]
    pub fn is_unix(&self) -> bool {
        matches!(self, Platform::MacOS | Platform::Linux | Platform::Wsl)
    }
}

impl fmt::Display for Platform {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Platform::MacOS => write!(f, "macOS"),
            Platform::Linux => write!(f, "Linux"),
            Platform::Windows => write!(f, "Windows"),
            Platform::Wsl => write!(f, "WSL"),
        }
    }
}
