use crate::ssh::config::SshConfig;
use crate::ui;

pub fn run() -> Result<(), String> {
    let config_path = get_config_path()?;
    let config = SshConfig::load(&config_path)?;
    let hosts = config.list_hosts();

    if hosts.is_empty() {
        ui::info("No SSH host entries found in ~/.ssh/config");
        return Ok(());
    }

    ui::header("SSH Host Entries");
    for host in hosts {
        println!();
        print!("{host}");
    }

    Ok(())
}

fn get_config_path() -> Result<std::path::PathBuf, String> {
    let home = dirs::home_dir().ok_or("Could not determine home directory")?;
    Ok(home.join(".ssh").join("config"))
}
