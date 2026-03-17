use crate::cli::RemoveArgs;
use crate::prompt;
use crate::ssh::{agent, config::SshConfig, keygen};
use crate::ui;

pub fn run(args: RemoveArgs) -> Result<(), String> {
    let home = dirs::home_dir().ok_or("Could not determine home directory")?;
    let ssh_dir = home.join(".ssh");
    let key_name = &args.key;

    if !keygen::key_exists(&ssh_dir, key_name) {
        return Err(format!(
            "Key '{key_name}' not found in {}",
            ssh_dir.display()
        ));
    }

    let confirm = prompt::prompt_confirm(
        &format!("Remove key '{key_name}' and associated config entries?"),
        false,
    )?;

    if !confirm {
        ui::info("Removal cancelled.");
        return Ok(());
    }

    // Remove from agent
    let key_path = ssh_dir.join(key_name);
    match agent::remove_key(&key_path) {
        Ok(()) => ui::success("Removed key from SSH agent"),
        Err(_) => ui::warning("Key was not loaded in the agent (or agent not running)"),
    }

    // Remove config entries that reference this key
    let config_path = ssh_dir.join("config");
    if config_path.exists() {
        let mut ssh_config = SshConfig::load(&config_path)?;
        let hosts = ssh_config.find_hosts_by_key(key_name);

        for host in &hosts {
            ssh_config.remove_host(host);
            ui::success(&format!("Removed config entry for {host}"));
        }

        if !hosts.is_empty() {
            ssh_config.write(&config_path)?;
        }
    }

    // Remove key files
    keygen::remove_key_files(&ssh_dir, key_name)?;
    ui::success(&format!("Removed key files for '{key_name}'"));

    // Remove per-key gitconfig if it exists
    let gitconfig = ssh_dir.join(format!(".gitconfig-{key_name}"));
    if gitconfig.exists() {
        let _ = std::fs::remove_file(&gitconfig);
        ui::success(&format!("Removed {}", gitconfig.display()));
    }

    Ok(())
}
