use std::path::PathBuf;

use crate::cli::SetupArgs;
use crate::platform::{browser, clipboard, Platform};
use crate::prompt;
use crate::providers::Provider;
use crate::ssh::{agent, config, connection, keygen};
use crate::ui;

pub fn run(args: SetupArgs, platform: Platform) -> Result<(), String> {
    let ssh_dir = get_ssh_dir()?;

    // Check prerequisites
    check_prerequisites()?;

    // 1. Resolve provider
    let provider_str = args.provider.or(args.provider_flag);
    let provider_parsed = provider_str.as_deref().and_then(Provider::from_str_loose);
    let provider = prompt::prompt_provider(provider_parsed)?;

    ui::info(&format!("Setting up SSH key for {provider}"));

    // 2. Get email
    let email = prompt::prompt_email(args.email)?;

    // 3. Get key name
    let key_name = prompt::prompt_key_name(args.key)?;

    // 4. Check if key already exists
    if keygen::key_exists(&ssh_dir, &key_name) {
        if args.force {
            ui::warning(&format!("Overwriting existing key: {key_name}"));
        } else {
            let overwrite = prompt::prompt_confirm(
                &format!("Key '{key_name}' already exists. Overwrite?"),
                false,
            )?;
            if !overwrite {
                ui::info("Setup cancelled.");
                return Ok(());
            }
        }
    }

    // 5. Get hostname
    let hostname = prompt::prompt_hostname(args.host, provider.default_hostname())?;

    // 6. Generate SSH key
    let sp = ui::spinner("Generating SSH key...");
    let key_pair = keygen::generate_key(&ssh_dir, &key_name, &email, provider.key_type())?;
    sp.finish_and_clear();
    ui::success(&format!(
        "Generated {} key: {}",
        provider.key_type().algorithm(),
        key_pair.private_key.display()
    ));

    // 7. Start SSH agent + add key
    match agent::add_key(&key_pair.private_key, platform) {
        Ok(()) => ui::success("Added key to SSH agent"),
        Err(e) => ui::warning(&format!("Could not add key to agent: {e}")),
    }

    // 8. Write SSH config
    let config_path = ssh_dir.join("config");
    let mut ssh_config = config::SshConfig::load(&config_path)?;

    if ssh_config.find_host(&hostname).is_some() {
        if args.force {
            let block = make_host_block(&hostname, &key_pair.private_key, provider);
            ssh_config.replace_host(&hostname, block);
            ui::warning(&format!("Replaced existing config entry for {hostname}"));
        } else {
            let replace = prompt::prompt_confirm(
                &format!("Config entry for '{hostname}' exists. Replace?"),
                false,
            )?;
            if replace {
                let block = make_host_block(&hostname, &key_pair.private_key, provider);
                ssh_config.replace_host(&hostname, block);
            }
        }
    } else {
        let block = make_host_block(&hostname, &key_pair.private_key, provider);
        ssh_config.add_host(block);
    }

    ssh_config.write(&config_path)?;
    ui::success(&format!("Updated {}", config_path.display()));

    // 9. Git config
    if !args.no_git_config {
        setup_git_config(&ssh_dir, &key_name, &email)?;
    }

    // 10. Copy public key to clipboard
    if !args.no_clipboard {
        let pub_key = keygen::read_public_key(&ssh_dir, &key_name)?;
        match clipboard::copy_to_clipboard(&pub_key, platform) {
            Ok(()) => ui::success("Public key copied to clipboard"),
            Err(e) => ui::warning(&format!("Could not copy to clipboard: {e}")),
        }
    }

    // 11. Open browser
    if !args.no_browser {
        ui::info(&format!(
            "Opening {} SSH settings...",
            provider.display_name()
        ));
        match browser::open_url(provider.settings_url(), platform) {
            Ok(()) => ui::success("Opened browser"),
            Err(e) => {
                ui::warning(&format!("Could not open browser: {e}"));
                ui::info(&format!("Add your key at: {}", provider.settings_url()));
            }
        }
    } else {
        ui::info(&format!("Add your key at: {}", provider.settings_url()));
    }

    // 12. Print summary
    ui::header("Setup complete!");
    println!("  Provider:  {provider}");
    println!("  Key:       {}", key_pair.private_key.display());
    println!("  Host:      {hostname}");
    println!();

    // 13. Offer connection test (interactive only)
    let is_interactive = provider_str.is_none();
    if is_interactive {
        let test = prompt::prompt_confirm("Test SSH connection now?", true)?;
        if test {
            ui::info(&format!("Testing connection to {hostname}..."));
            let (success, output) = connection::test_connection(&hostname);
            if success {
                ui::success("Connection successful!");
            } else {
                ui::error("Connection failed.");
            }
            if !output.is_empty() {
                println!("{output}");
            }
        }
    }

    Ok(())
}

fn get_ssh_dir() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Could not determine home directory")?;
    let ssh_dir = home.join(".ssh");
    std::fs::create_dir_all(&ssh_dir)
        .map_err(|e| format!("Failed to create {}: {e}", ssh_dir.display()))?;

    // Set permissions on Unix
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = std::fs::Permissions::from_mode(0o700);
        std::fs::set_permissions(&ssh_dir, perms)
            .map_err(|e| format!("Failed to set permissions on {}: {e}", ssh_dir.display()))?;
    }

    Ok(ssh_dir)
}

fn check_prerequisites() -> Result<(), String> {
    if which::which("ssh-keygen").is_err() {
        return Err("ssh-keygen not found. Please install OpenSSH.".to_string());
    }
    if which::which("ssh-add").is_err() {
        ui::warning("ssh-add not found. SSH agent features will be unavailable.");
    }
    if which::which("git").is_err() {
        ui::warning("git not found. Git config features will be unavailable.");
    }
    Ok(())
}

fn make_host_block(
    hostname: &str,
    key_path: &std::path::Path,
    provider: Provider,
) -> config::HostBlock {
    let mut directives = vec![
        (
            "HostName".to_string(),
            provider.default_hostname().to_string(),
        ),
        ("User".to_string(), "git".to_string()),
        (
            "IdentityFile".to_string(),
            key_path.to_string_lossy().to_string(),
        ),
        ("IdentitiesOnly".to_string(), "yes".to_string()),
    ];

    // Azure DevOps requires a different Host key format
    if provider == Provider::AzureDevOps {
        directives.push(("HostkeyAlgorithms".to_string(), "+ssh-rsa".to_string()));
        directives.push((
            "PubkeyAcceptedAlgorithms".to_string(),
            "+ssh-rsa".to_string(),
        ));
    }

    config::HostBlock {
        host: hostname.to_string(),
        directives,
    }
}

fn setup_git_config(ssh_dir: &std::path::Path, key_name: &str, email: &str) -> Result<(), String> {
    if which::which("git").is_err() {
        return Ok(());
    }

    let configure =
        prompt::prompt_confirm("Configure git user.name and user.email for this key?", true)?;
    if !configure {
        return Ok(());
    }

    let name = prompt::prompt_git_name(None)?;

    // Create a per-key gitconfig file
    let gitconfig_path = ssh_dir.join(format!(".gitconfig-{key_name}"));
    let content = format!("[user]\n    name = {name}\n    email = {email}\n");
    std::fs::write(&gitconfig_path, &content)
        .map_err(|e| format!("Failed to write {}: {e}", gitconfig_path.display()))?;

    ui::success(&format!("Created {}", gitconfig_path.display()));

    // Set global git config
    let _ = std::process::Command::new("git")
        .args(["config", "--global", "user.name", &name])
        .output();
    let _ = std::process::Command::new("git")
        .args(["config", "--global", "user.email", email])
        .output();

    ui::success("Updated global git config");

    Ok(())
}
