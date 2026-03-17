use crate::cli::ConfigArgs;
use crate::ssh::config::SshConfig;
use crate::ui;

pub fn run(args: ConfigArgs) -> Result<(), String> {
    let home = dirs::home_dir().ok_or("Could not determine home directory")?;
    let config_path = home.join(".ssh").join("config");
    let config = SshConfig::load(&config_path)?;

    match args.action.as_deref() {
        Some("show") => {
            let host = args.host.ok_or("Usage: sshx config show <hostname>")?;

            match config.find_host(&host) {
                Some(block) => {
                    print!("{block}");
                }
                None => {
                    ui::error(&format!("No config entry found for '{host}'"));
                }
            }
        }
        Some(other) => {
            return Err(format!("Unknown config action: {other}. Use: show"));
        }
        None => {
            // Show all host entries
            let hosts = config.list_hosts();
            if hosts.is_empty() {
                ui::info("No SSH host entries found.");
                return Ok(());
            }

            for host in hosts {
                print!("{host}");
                println!();
            }
        }
    }

    Ok(())
}
