use crate::cli::CompletionsArgs;
use clap::CommandFactory;
use std::io;

pub fn run(args: CompletionsArgs) -> Result<(), String> {
    let mut cmd = crate::cli::Cli::command();
    clap_complete::generate(args.shell, &mut cmd, "sshx", &mut io::stdout());
    Ok(())
}
