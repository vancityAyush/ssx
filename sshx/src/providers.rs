use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Provider {
    GitHub,
    GitLab,
    Bitbucket,
    AzureDevOps,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum KeyType {
    Ed25519,
    Rsa4096,
}

impl Provider {
    pub const ALL: &[Provider] = &[
        Provider::GitHub,
        Provider::GitLab,
        Provider::Bitbucket,
        Provider::AzureDevOps,
    ];

    pub fn display_name(&self) -> &'static str {
        match self {
            Provider::GitHub => "GitHub",
            Provider::GitLab => "GitLab",
            Provider::Bitbucket => "Bitbucket",
            Provider::AzureDevOps => "Azure DevOps",
        }
    }

    pub fn default_hostname(&self) -> &'static str {
        match self {
            Provider::GitHub => "github.com",
            Provider::GitLab => "gitlab.com",
            Provider::Bitbucket => "bitbucket.org",
            Provider::AzureDevOps => "ssh.dev.azure.com",
        }
    }

    pub fn settings_url(&self) -> &'static str {
        match self {
            Provider::GitHub => "https://github.com/settings/ssh/new",
            Provider::GitLab => "https://gitlab.com/-/user_settings/ssh_keys",
            Provider::Bitbucket => "https://bitbucket.org/account/settings/ssh-keys/",
            Provider::AzureDevOps => "https://dev.azure.com/_usersSettings/keys",
        }
    }

    pub fn key_type(&self) -> KeyType {
        match self {
            Provider::AzureDevOps => KeyType::Rsa4096,
            _ => KeyType::Ed25519,
        }
    }

    #[allow(dead_code)]
    pub fn ssh_test_command(&self) -> &'static str {
        match self {
            Provider::GitHub => "git@github.com",
            Provider::GitLab => "git@gitlab.com",
            Provider::Bitbucket => "git@bitbucket.org",
            Provider::AzureDevOps => "git@ssh.dev.azure.com",
        }
    }

    pub fn from_str_loose(s: &str) -> Option<Provider> {
        match s.to_lowercase().as_str() {
            "github" | "gh" => Some(Provider::GitHub),
            "gitlab" | "gl" => Some(Provider::GitLab),
            "bitbucket" | "bb" => Some(Provider::Bitbucket),
            "azure" | "azuredevops" | "azure-devops" | "ado" => Some(Provider::AzureDevOps),
            _ => None,
        }
    }
}

impl fmt::Display for Provider {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.display_name())
    }
}

impl KeyType {
    pub fn algorithm(&self) -> &'static str {
        match self {
            KeyType::Ed25519 => "ed25519",
            KeyType::Rsa4096 => "rsa",
        }
    }

    pub fn bits(&self) -> Option<u32> {
        match self {
            KeyType::Ed25519 => None,
            KeyType::Rsa4096 => Some(4096),
        }
    }
}
