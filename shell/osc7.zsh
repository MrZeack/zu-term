# Report the cwd to the terminal (OSC 7) so new splits open in the same folder.
# Needed when the shell runs behind a wrapper (e.g. kiro-cli-term) whose own
# cwd never changes.
_zu_term_osc7() {
  local path_enc=${${PWD//\%/%25}// /%20}
  printf '\e]7;file://%s%s\e\\' "$HOST" "$path_enc"
}

# Tell Zu Term which command currently owns the prompt. The value is restricted to
# a command basename so terminal output cannot inject markup into the header.
_zu_term_emit_command() {
  printf '\e]1337;ZuTermCommand=%s\e\\' "$1"
}

_zu_term_preexec() {
  local -a words
  local word command=''
  words=(${(z)1})
  for word in $words; do
    [[ "$word" == *=* && "$word" != -* ]] && continue
    case "$word" in
      command|env|exec|nohup|sudo|time) continue ;;
    esac
    command=${word##*/}
    break
  done
  if [[ "$command" =~ '^[A-Za-z0-9][A-Za-z0-9._+-]*$' ]]; then
    _zu_term_emit_command "$command"
  else
    _zu_term_emit_command ''
  fi
}

_zu_term_precmd() {
  _zu_term_emit_command ''
}

autoload -Uz add-zsh-hook
add-zsh-hook precmd _zu_term_osc7
add-zsh-hook chpwd _zu_term_osc7
add-zsh-hook preexec _zu_term_preexec
add-zsh-hook precmd _zu_term_precmd
