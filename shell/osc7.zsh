# Report the cwd to the terminal (OSC 7) so new splits open in the same folder.
# Needed when the shell runs behind a wrapper (e.g. kiro-cli-term) whose own
# cwd never changes.
_console_osc7() {
  local path_enc=${${PWD//\%/%25}// /%20}
  printf '\e]7;file://%s%s\e\\' "$HOST" "$path_enc"
}

autoload -Uz add-zsh-hook
add-zsh-hook precmd _console_osc7
add-zsh-hook chpwd _console_osc7
