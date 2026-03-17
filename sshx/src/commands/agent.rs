use crate::cli::AgentArgs;
use crate::platform::Platform;
use crate::ssh::agent as ssh_agent;
use crate::ui;

pub fn run(args: AgentArgs, platform: Platform) -> Result<(), String> {
    match args.action.as_str() {
        "list" | "ls" => {
            let output = ssh_agent::list_keys()?;
            println!("{output}");
        }
        "add" => {
            let key_name = args.key.ok_or("Usage: sshx agent add <key_name>")?;
            let home = dirs::home_dir().ok_or("Could not determine home directory")?;
            let key_path = home.join(".ssh").join(&key_name);

            if !key_path.exists() {
                return Err(format!("Key file not found: {}", key_path.display()));
            }

            ssh_agent::add_key(&key_path, platform)?;
            ui::success(&format!("Added {key_name} to SSH agent"));
        }
        "remove" | "rm" => {
            let key_name = args.key.ok_or("Usage: sshx agent remove <key_name>")?;
            let home = dirs::home_dir().ok_or("Could not determine home directory")?;
            let key_path = home.join(".ssh").join(&key_name);

            ssh_agent::remove_key(&key_path)?;
            ui::success(&format!("Removed {key_name} from SSH agent"));
        }
        other => {
            return Err(format!(
                "Unknown agent action: {other}. Use: list, add, remove"
            ));
        }
    }

    Ok(())
}
