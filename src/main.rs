mod cli;
mod commands;
mod platform;
mod prompt;
mod providers;
mod ssh;
mod ui;

use clap::Parser;
use cli::{Cli, Commands, SetupArgs};
use platform::Platform;

fn main() {
    let platform = Platform::detect();
    let cli = Cli::parse();

    // Register ctrlc handler
    ctrlc::set_handler(move || {
        eprintln!("\nInterrupted. Exiting...");
        std::process::exit(130);
    })
    .ok();

    let result = match cli.command {
        None => {
            // Default: interactive setup
            commands::setup::run(SetupArgs::default(), platform)
        }
        Some(Commands::Setup(args)) => commands::setup::run(args, platform),
        Some(Commands::Test(args)) => commands::test::run(args),
        Some(Commands::List) => commands::list::run(),
        Some(Commands::Remove(args)) => commands::remove::run(args),
        Some(Commands::Copy(args)) => commands::copy::run(args, platform),
        Some(Commands::Config(args)) => commands::config::run(args),
        Some(Commands::Agent(args)) => commands::agent::run(args, platform),
        Some(Commands::Init(args)) => commands::init::run(args),
        Some(Commands::Completions(args)) => commands::completions::run(args),
    };

    if let Err(e) = result {
        ui::error(&e);
        std::process::exit(1);
    }
}
