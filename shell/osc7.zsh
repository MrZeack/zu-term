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

_zu_term_emit_agent() {
  printf '\e]1337;ZuTermAgent=%s\e\\' "$1"
}

_zu_term_agent_payload() {
  local -a words=("$@")
  local word command provider='' session='' token next
  integer i=0

  for ((i = 1; i <= ${#words}; i++)); do
    word=${words[i]}
    [[ "$word" == *=* && "$word" != -* ]] && continue
    case "$word" in
      command|env|exec|nohup|sudo|time) continue ;;
    esac
    command=${word##*/}
    case "$command" in
      codex) provider='codex' ;;
      claude|claude-code) provider='claude' ;;
      kiro|kiro-cli) provider='kiro' ;;
      muse) provider='muse' ;;
      agy|antigravity) provider='antigravity' ;;
      *) return 0 ;;
    esac
    break
  done

  for ((i = i + 1; i <= ${#words}; i++)); do
    token=${words[i]}
    case "$token" in
      resume|-r|--resume|--resume-id|--conversation)
        next=${words[i + 1]}
        [[ -n "$next" && "$next" != -* ]] && session=$next
        break
        ;;
      --resume=*|--resume-id=*|--conversation=*)
        session=${token#*=}
        break
        ;;
    esac
  done

  if [[ -n "$session" && "$session" =~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$' ]]; then
    print -r -- "$provider|$session"
  else
    print -r -- "$provider"
  fi
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
  _zu_term_emit_agent "$(_zu_term_agent_payload "${words[@]}")"
}

_zu_term_precmd() {
  _zu_term_emit_command ''
  _zu_term_emit_agent ''
}

_zu_term_configure_history() {
  if [[ -n "${ZU_TERM_HISTORY_FILE:-}" ]]; then
    HISTFILE="$ZU_TERM_HISTORY_FILE"
    export HISTFILE
  fi
}

autoload -Uz add-zsh-hook
add-zsh-hook precmd _zu_term_configure_history
add-zsh-hook precmd _zu_term_osc7
add-zsh-hook chpwd _zu_term_osc7
add-zsh-hook preexec _zu_term_preexec
add-zsh-hook precmd _zu_term_precmd
_zu_term_configure_history
