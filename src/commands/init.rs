use crate::cli::InitArgs;
use clap_complete::Shell;

pub fn run(args: InitArgs) -> Result<(), String> {
    let script = match args.shell {
        Shell::Bash => BASH_WRAPPER,
        Shell::Zsh => ZSH_WRAPPER,
        Shell::Fish => FISH_WRAPPER,
        Shell::PowerShell => POWERSHELL_WRAPPER,
        Shell::Elvish => ELVISH_WRAPPER,
        _ => return Err("Unsupported shell. Supported: bash, zsh, fish, powershell, elvish".to_string()),
    };

    println!("{}", script);
    Ok(())
}

const BASH_WRAPPER: &str = r#"
# sshx shell integration for bash
sshx() {
    local tmpfile
    tmpfile=$(mktemp -t sshx-env.XXXXXX)
    
    # Run the real rust binary
    SSHX_ENV_FILE="$tmpfile" command sshx "$@"
    local exit_code=$?
    
    # Evaluate exported variables if file exists and has content
    if [ -s "$tmpfile" ]; then
        source "$tmpfile"
    fi
    
    # Cleanup
    rm -f "$tmpfile"
    
    return $exit_code
}
"#;

const ZSH_WRAPPER: &str = r#"
# sshx shell integration for zsh
sshx() {
    local tmpfile
    tmpfile=$(mktemp -t sshx-env.XXXXXX)
    
    # Run the real rust binary
    SSHX_ENV_FILE="$tmpfile" command sshx "$@"
    local exit_code=$?
    
    # Evaluate exported variables if file exists and has content
    if [[ -s "$tmpfile" ]]; then
        source "$tmpfile"
    fi
    
    # Cleanup
    rm -f "$tmpfile"
    
    return $exit_code
}
"#;

const FISH_WRAPPER: &str = r#"
# sshx shell integration for fish
function sshx
    set -l tmpfile (mktemp -t sshx-env.XXXXXX)
    
    # Run the real rust binary
    env SSHX_ENV_FILE=$tmpfile command sshx $argv
    set -l exit_code $status
    
    # Evaluate exported variables if file exists and has content
    if test -s $tmpfile
        source $tmpfile
    end
    
    # Cleanup
    rm -f $tmpfile
    
    return $exit_code
end
"#;

const POWERSHELL_WRAPPER: &str = r#"
# sshx shell integration for PowerShell
function sshx {
    $tmpfile = New-TemporaryFile
    
    try {
        $env:SSHX_ENV_FILE = $tmpfile.FullName
        & sshx.exe $args
        $exit_code = $LASTEXITCODE
        
        if ((Get-Item $tmpfile.FullName).Length -gt 0) {
            . $tmpfile.FullName
        }
    } finally {
        Remove-Item $env:SSHX_ENV_FILE -ErrorAction SilentlyContinue
        Remove-Item $tmpfile.FullName -ErrorAction SilentlyContinue
    }
    
    exit $exit_code
}
"#;

const ELVISH_WRAPPER: &str = r#"
# sshx shell integration for elvish
fn sshx {|@args|
    use os
    var tmpfile = (os:temp-file "sshx-env.XXXXXX")
    
    # Run the real rust binary
    E:SSHX_ENV_FILE=$tmpfile.name env sshx $@args
    
    # Evaluate exported variables if file exists and has content
    if (> (os:stat $tmpfile.name|get size) 0) {
        eval (slurp < $tmpfile.name)
    }
    
    # Cleanup
    os:remove $tmpfile.name
}
"#;
