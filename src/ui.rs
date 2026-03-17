use console::{style, Term};
use indicatif::{ProgressBar, ProgressStyle};
use std::time::Duration;

pub fn success(msg: &str) {
    let term = Term::stderr();
    let _ = term.write_line(&format!("{} {}", style("✓").green().bold(), msg));
}

pub fn error(msg: &str) {
    let term = Term::stderr();
    let _ = term.write_line(&format!("{} {}", style("✗").red().bold(), msg));
}

pub fn warning(msg: &str) {
    let term = Term::stderr();
    let _ = term.write_line(&format!("{} {}", style("!").yellow().bold(), msg));
}

pub fn info(msg: &str) {
    let term = Term::stderr();
    let _ = term.write_line(&format!("{} {}", style("→").cyan().bold(), msg));
}

pub fn header(msg: &str) {
    let term = Term::stderr();
    let _ = term.write_line(&format!("\n{}", style(msg).bold().underlined()));
}

pub fn spinner(msg: &str) -> ProgressBar {
    let pb = ProgressBar::new_spinner();
    pb.set_style(
        ProgressStyle::default_spinner()
            .tick_strings(&["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"])
            .template("{spinner:.cyan} {msg}")
            .expect("valid template"),
    );
    pb.set_message(msg.to_string());
    pb.enable_steady_tick(Duration::from_millis(80));
    pb
}
