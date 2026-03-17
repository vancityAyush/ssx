use crate::cli::CopyArgs;
use crate::platform::{clipboard, Platform};
use crate::ssh::keygen;
use crate::ui;

pub fn run(args: CopyArgs, platform: Platform) -> Result<(), String> {
    let home = dirs::home_dir().ok_or("Could not determine home directory")?;
    let ssh_dir = home.join(".ssh");

    let pub_key = keygen::read_public_key(&ssh_dir, &args.key)?;
    clipboard::copy_to_clipboard(&pub_key, platform)?;
    ui::success(&format!("Public key '{}' copied to clipboard", args.key));

    Ok(())
}
