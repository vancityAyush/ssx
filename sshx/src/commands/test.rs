use crate::cli::TestArgs;
use crate::ssh::connection;
use crate::ui;

pub fn run(args: TestArgs) -> Result<(), String> {
    ui::info(&format!("Testing SSH connection to {}...", args.host));

    let (success, output) = connection::test_connection(&args.host);

    if !output.is_empty() {
        println!("{output}");
    }

    if success {
        ui::success("Connection successful!");
        Ok(())
    } else {
        ui::error("Connection failed.");
        Err("SSH connection test failed".to_string())
    }
}
