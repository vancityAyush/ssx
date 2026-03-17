use std::fmt;
use std::fs;
use std::path::Path;

#[derive(Debug, Clone)]
pub enum ConfigEntry {
    HostBlock(HostBlock),
    Comment(String),
    BlankLine,
    RawLine(String),
}

#[derive(Debug, Clone)]
pub struct HostBlock {
    pub host: String,
    pub directives: Vec<(String, String)>,
}

impl HostBlock {
    pub fn get(&self, key: &str) -> Option<&str> {
        self.directives
            .iter()
            .find(|(k, _)| k.eq_ignore_ascii_case(key))
            .map(|(_, v)| v.as_str())
    }
}

impl fmt::Display for HostBlock {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        writeln!(f, "Host {}", self.host)?;
        for (key, value) in &self.directives {
            writeln!(f, "    {key} {value}")?;
        }
        Ok(())
    }
}

#[derive(Debug, Clone)]
pub struct SshConfig {
    pub entries: Vec<ConfigEntry>,
}

impl SshConfig {
    pub fn parse(content: &str) -> SshConfig {
        let mut entries = Vec::new();
        let mut current_block: Option<HostBlock> = None;

        for line in content.lines() {
            let trimmed = line.trim();

            if trimmed.is_empty() {
                if let Some(block) = current_block.take() {
                    entries.push(ConfigEntry::HostBlock(block));
                }
                entries.push(ConfigEntry::BlankLine);
                continue;
            }

            if trimmed.starts_with('#') {
                if let Some(block) = current_block.take() {
                    entries.push(ConfigEntry::HostBlock(block));
                }
                entries.push(ConfigEntry::Comment(line.to_string()));
                continue;
            }

            if let Some(host) = trimmed
                .strip_prefix("Host ")
                .or_else(|| trimmed.strip_prefix("Host\t"))
            {
                if let Some(block) = current_block.take() {
                    entries.push(ConfigEntry::HostBlock(block));
                }
                current_block = Some(HostBlock {
                    host: host.trim().to_string(),
                    directives: Vec::new(),
                });
                continue;
            }

            // Check if this is an indented directive belonging to a Host block
            if (line.starts_with(' ') || line.starts_with('\t')) && current_block.is_some() {
                if let Some(ref mut block) = current_block {
                    if let Some((key, value)) = split_directive(trimmed) {
                        block.directives.push((key, value));
                    } else {
                        block.directives.push((trimmed.to_string(), String::new()));
                    }
                }
                continue;
            }

            // Non-indented, non-Host line outside a block
            if let Some(block) = current_block.take() {
                entries.push(ConfigEntry::HostBlock(block));
            }
            entries.push(ConfigEntry::RawLine(line.to_string()));
        }

        // Don't forget the last block
        if let Some(block) = current_block.take() {
            entries.push(ConfigEntry::HostBlock(block));
        }

        SshConfig { entries }
    }

    pub fn load(path: &Path) -> Result<SshConfig, String> {
        if !path.exists() {
            return Ok(SshConfig {
                entries: Vec::new(),
            });
        }
        let content = fs::read_to_string(path)
            .map_err(|e| format!("Failed to read {}: {e}", path.display()))?;
        Ok(Self::parse(&content))
    }

    pub fn list_hosts(&self) -> Vec<&HostBlock> {
        self.entries
            .iter()
            .filter_map(|e| match e {
                ConfigEntry::HostBlock(b) => Some(b),
                _ => None,
            })
            .collect()
    }

    pub fn find_host(&self, name: &str) -> Option<&HostBlock> {
        self.list_hosts().into_iter().find(|b| b.host == name)
    }

    pub fn add_host(&mut self, block: HostBlock) {
        // Add a blank line before the new block if the file is not empty
        if !self.entries.is_empty() {
            // Check if last entry is already a blank line
            if !matches!(self.entries.last(), Some(ConfigEntry::BlankLine)) {
                self.entries.push(ConfigEntry::BlankLine);
            }
        }
        self.entries.push(ConfigEntry::HostBlock(block));
    }

    pub fn remove_host(&mut self, name: &str) -> bool {
        let before = self.entries.len();
        self.entries
            .retain(|e| !matches!(e, ConfigEntry::HostBlock(b) if b.host == name));
        self.entries.len() != before
    }

    pub fn replace_host(&mut self, name: &str, new_block: HostBlock) -> bool {
        for entry in &mut self.entries {
            if let ConfigEntry::HostBlock(ref mut b) = entry {
                if b.host == name {
                    *b = new_block;
                    return true;
                }
            }
        }
        false
    }

    pub fn write(&self, path: &Path) -> Result<(), String> {
        // Ensure parent directory exists
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create directory {}: {e}", parent.display()))?;
        }

        let content = self.to_string();
        fs::write(path, &content)
            .map_err(|e| format!("Failed to write {}: {e}", path.display()))?;

        // Set permissions on Unix
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let perms = fs::Permissions::from_mode(0o600);
            fs::set_permissions(path, perms)
                .map_err(|e| format!("Failed to set permissions on {}: {e}", path.display()))?;
        }

        Ok(())
    }

    /// Find host blocks that reference a given key file
    pub fn find_hosts_by_key(&self, key_path: &str) -> Vec<String> {
        self.list_hosts()
            .into_iter()
            .filter(|b| {
                b.get("IdentityFile")
                    .map(|f| f.contains(key_path))
                    .unwrap_or(false)
            })
            .map(|b| b.host.clone())
            .collect()
    }
}

impl fmt::Display for SshConfig {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        for entry in &self.entries {
            match entry {
                ConfigEntry::HostBlock(block) => {
                    write!(f, "{block}")?;
                }
                ConfigEntry::Comment(line) => {
                    writeln!(f, "{line}")?;
                }
                ConfigEntry::BlankLine => {
                    writeln!(f)?;
                }
                ConfigEntry::RawLine(line) => {
                    writeln!(f, "{line}")?;
                }
            }
        }
        Ok(())
    }
}

fn split_directive(s: &str) -> Option<(String, String)> {
    // Split on first whitespace or '='
    let s = s.trim();
    let pos = s.find(|c: char| c.is_whitespace() || c == '=')?;
    let key = s[..pos].to_string();
    let value = s[pos + 1..].trim_start_matches(|c: char| c.is_whitespace() || c == '=');
    Some((key, value.to_string()))
}
