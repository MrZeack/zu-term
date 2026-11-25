use portable_pty::CommandBuilder;
use tauri::{AppHandle, Emitter, State, command};

use crate::workspace_store::ConfigStore;

pub const TELEMETRY_CHANGED_EVENT: &str = "zu-term://telemetry-changed";

/// Opt-out variables for common CLIs. Only set in shells Zu Term starts; the
/// user's own startup files run afterwards and may still override them.
pub const OPT_OUT_ENV: &[(&str, &str)] = &[
    ("DO_NOT_TRACK", "1"),                 // Claude Code, Bun, Supabase and others
    ("DISABLE_ERROR_REPORTING", "1"),      // Claude Code (Sentry)
    ("DISABLE_TELEMETRY", "1"),            // Claude Code
    ("WRANGLER_SEND_METRICS", "false"),    // Cloudflare
    ("GH_TELEMETRY", "false"),             // GitHub CLI
    ("NEXT_TELEMETRY_DISABLED", "1"),      // Next.js
    ("ASTRO_TELEMETRY_DISABLED", "1"),     // Astro
    ("VERCEL_TELEMETRY_DISABLED", "1"),    // Vercel
    ("HOMEBREW_NO_ANALYTICS", "1"),        // Homebrew
    ("DOTNET_CLI_TELEMETRY_OPTOUT", "1"),  // .NET
    ("AZURE_CORE_COLLECT_TELEMETRY", "0"), // Azure CLI
    ("FUNCTIONS_CORE_TOOLS_TELEMETRY_OPTOUT", "1"), // Azure Functions
    ("POWERSHELL_TELEMETRY_OPTOUT", "1"),  // PowerShell
    ("SAM_CLI_TELEMETRY", "0"),            // AWS SAM
    ("CHECKPOINT_DISABLE", "1"),           // HashiCorp, Prisma
    ("GATSBY_TELEMETRY_DISABLED", "1"),    // Gatsby
    ("NUXT_TELEMETRY_DISABLED", "1"),      // Nuxt
    ("TURBO_TELEMETRY_DISABLED", "1"),     // Turborepo
    ("STORYBOOK_DISABLE_TELEMETRY", "1"),  // Storybook
    ("NG_CLI_ANALYTICS", "false"),         // Angular
    ("EXPO_NO_TELEMETRY", "1"),            // Expo
    ("SST_TELEMETRY_DISABLED", "1"),       // SST
    ("STRIPE_CLI_TELEMETRY_OPTOUT", "1"),  // Stripe
    ("HF_HUB_DISABLE_TELEMETRY", "1"),     // Hugging Face
    ("SCARF_ANALYTICS", "false"),          // Scarf (npm packages)
];

pub fn apply(command: &mut CommandBuilder) {
    for (name, value) in OPT_OUT_ENV {
        command.env(name, value);
    }
}

#[command]
pub async fn telemetry_block_set(
    app: AppHandle,
    store: State<'_, ConfigStore>,
    enabled: bool,
) -> Result<(), String> {
    store.set_block_telemetry(enabled)?;
    let _ = app.emit(TELEMETRY_CHANGED_EVENT, enabled);
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::ffi::OsStr;

    use super::*;

    #[test]
    fn sets_the_opt_out_of_every_listed_tool() {
        let mut command = CommandBuilder::new("sh");
        apply(&mut command);
        for (name, value) in [
            ("DO_NOT_TRACK", "1"),
            ("DISABLE_ERROR_REPORTING", "1"),
            ("DISABLE_TELEMETRY", "1"),
            ("WRANGLER_SEND_METRICS", "false"),
            ("GH_TELEMETRY", "false"),
            ("NEXT_TELEMETRY_DISABLED", "1"),
            ("ASTRO_TELEMETRY_DISABLED", "1"),
            ("VERCEL_TELEMETRY_DISABLED", "1"),
            ("HOMEBREW_NO_ANALYTICS", "1"),
            ("DOTNET_CLI_TELEMETRY_OPTOUT", "1"),
            ("AZURE_CORE_COLLECT_TELEMETRY", "0"),
            ("FUNCTIONS_CORE_TOOLS_TELEMETRY_OPTOUT", "1"),
            ("POWERSHELL_TELEMETRY_OPTOUT", "1"),
            ("SAM_CLI_TELEMETRY", "0"),
            ("CHECKPOINT_DISABLE", "1"),
            ("GATSBY_TELEMETRY_DISABLED", "1"),
            ("NUXT_TELEMETRY_DISABLED", "1"),
            ("TURBO_TELEMETRY_DISABLED", "1"),
            ("STORYBOOK_DISABLE_TELEMETRY", "1"),
            ("NG_CLI_ANALYTICS", "false"),
            ("EXPO_NO_TELEMETRY", "1"),
            ("SST_TELEMETRY_DISABLED", "1"),
            ("STRIPE_CLI_TELEMETRY_OPTOUT", "1"),
            ("HF_HUB_DISABLE_TELEMETRY", "1"),
            ("SCARF_ANALYTICS", "false"),
        ] {
            assert_eq!(command.get_env(name), Some(OsStr::new(value)), "{name}");
        }
        assert_eq!(OPT_OUT_ENV.len(), 25, "every variable is covered above");
    }
}
