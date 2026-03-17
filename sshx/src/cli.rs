use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "sshx", about = "SSH key manager for Git providers", version)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Option<Commands>,

    /// Show detailed output
    #[arg(short, long, global = true)]
    pub verbose: bool,

    /// Suppress non-essential output
    #[arg(short, long, global = true)]
    pub quiet: bool,
}

#[derive(Subcommand)]
pub enum Commands {
    /// Generate and configure an SSH key for a Git provider
    Setup(SetupArgs),

    /// Test SSH connection to a Git host
    Test(TestArgs),

    /// List SSH host entries from ~/.ssh/config
    List,

    /// Remove an SSH key (files + config + agent)
    Remove(RemoveArgs),

    /// Copy a key's public key to clipboard
    Copy(CopyArgs),

    /// View SSH config entries
    Config(ConfigArgs),

    /// Manage SSH agent (list, add, remove keys)
    Agent(AgentArgs),
}

#[derive(Parser, Default)]
pub struct SetupArgs {
    /// Git provider (github, gitlab, bitbucket, azure)
    pub provider: Option<String>,

    /// Provider (alternative to positional)
    #[arg(short, long)]
    pub provider_flag: Option<String>,

    /// Email address for the key
    #[arg(short, long)]
    pub email: Option<String>,

    /// Key file name
    #[arg(short, long)]
    pub key: Option<String>,

    /// Custom hostname
    #[arg(short = 'H', long)]
    pub host: Option<String>,

    /// Overwrite existing keys/config without prompting
    #[arg(long)]
    pub force: bool,

    /// Skip git config setup
    #[arg(long)]
    pub no_git_config: bool,

    /// Don't open browser
    #[arg(long)]
    pub no_browser: bool,

    /// Don't copy to clipboard
    #[arg(long)]
    pub no_clipboard: bool,
}

#[derive(Parser)]
pub struct TestArgs {
    /// Host to test (e.g. github.com)
    pub host: String,
}

#[derive(Parser)]
pub struct RemoveArgs {
    /// Key name to remove
    pub key: String,
}

#[derive(Parser)]
pub struct CopyArgs {
    /// Key name to copy
    pub key: String,
}

#[derive(Parser)]
pub struct ConfigArgs {
    /// Subcommand: show
    pub action: Option<String>,

    /// Host name to show
    pub host: Option<String>,
}

#[derive(Parser)]
pub struct AgentArgs {
    /// Subcommand: list, add, remove
    pub action: String,

    /// Key name (for add/remove)
    pub key: Option<String>,
}
