# Zu Term shell integration for bash (compatible with bash 3.2+ and 5.x).
# Reports cwd (OSC 7), active command, and agent metadata (OSC 1337), and sets
# up a per-pane HISTFILE without modifying the user's ~/.bashrc.

_zu_term_osc7() {
  local host="${HOSTNAME:-$(hostname 2>/dev/null || true)}"
  local path_enc="${PWD//\%/%25}"
  path_enc="${path_enc// /%20}"
  printf '\e]7;file://%s%s\e\\' "$host" "$path_enc"
}

_zu_term_emit_command() {
  printf '\e]1337;ZuTermCommand=%s\e\\' "$1"
}

_zu_term_emit_agent() {
  printf '\e]1337;ZuTermAgent=%s\e\\' "$1"
}

_zu_term_strip_quotes() {
  local val="$1"
  if [[ ${#val} -ge 2 ]]; then
    if [[ "${val:0:1}" == "'" && "${val: -1}" == "'" ]]; then
      val="${val:1:${#val}-2}"
    elif [[ "${val:0:1}" == '"' && "${val: -1}" == '"' ]]; then
      val="${val:1:${#val}-2}"
    fi
  fi
  printf '%s' "$val"
}

_zu_term_agent_payload() {
  local -a words=("$@")
  local count=${#words[@]}
  local i=0 word command provider="" session="" token next

  for ((i = 0; i < count; i++)); do
    word="${words[i]}"
    [[ "$word" == *=* && "$word" != -* ]] && continue
    case "$word" in
      command|env|exec|nohup|sudo|time) continue ;;
    esac
    command="${word##*/}"
    case "$command" in
      codex) provider="codex" ;;
      claude|claude-code) provider="claude" ;;
      kiro|kiro-cli) provider="kiro" ;;
      muse) provider="muse" ;;
      agy|antigravity) provider="antigravity" ;;
      *) return 0 ;;
    esac
    break
  done

  for ((i = i + 1; i < count; i++)); do
    token="${words[i]}"
    case "$token" in
      resume|-r|--resume|--resume-id|--conversation)
        if (( i + 1 < count )); then
          next="${words[i + 1]}"
          [[ -n "$next" && "$next" != -* ]] && session="$next"
        fi
        break
        ;;
      --resume=*|--resume-id=*|--conversation=*)
        session="${token#*=}"
        break
        ;;
    esac
  done

  session="$(_zu_term_strip_quotes "$session")"

  if [[ -n "$session" && "$session" =~ ^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$ ]]; then
    printf '%s|%s' "$provider" "$session"
  else
    printf '%s' "$provider"
  fi
}

_zu_term_report_command() {
  local raw="$1"
  local -a words=()
  local word command=""
  # shellcheck disable=SC2206
  read -r -a words <<< "$raw"
  for word in "${words[@]}"; do
    [[ "$word" == *=* && "$word" != -* ]] && continue
    case "$word" in
      command|env|exec|nohup|sudo|time) continue ;;
    esac
    command="${word##*/}"
    break
  done
  if [[ "$command" =~ ^[A-Za-z0-9][A-Za-z0-9._+-]*$ ]]; then
    _zu_term_emit_command "$command"
  else
    _zu_term_emit_command ""
  fi
  _zu_term_emit_agent "$(_zu_term_agent_payload "${words[@]}")"
}

_zu_term_clear_command() {
  _zu_term_emit_command ""
}

_zu_term_configure_history() {
  if [[ -n "${ZU_TERM_HISTORY_FILE:-}" ]]; then
    HISTFILE="$ZU_TERM_HISTORY_FILE"
    export HISTFILE
    (( ${HISTSIZE:-0} < 10000 )) && HISTSIZE=10000
    (( ${HISTFILESIZE:-0} < 10000 )) && HISTFILESIZE=10000
    shopt -s histappend 2>/dev/null || true
    if [[ "${_ZU_TERM_HISTORY_LOADED:-}" != "$HISTFILE" ]]; then
      [[ -f "$HISTFILE" ]] && history -r "$HISTFILE" 2>/dev/null || true
      _ZU_TERM_HISTORY_LOADED="$HISTFILE"
    fi
  fi
}

_zu_term_preexec() {
  [[ -z "${_ZU_TERM_AT_PROMPT:-}" ]] && return
  [[ -n "${COMP_LINE:-}" ]] && return
  case "${BASH_COMMAND:-}" in
    _zu_term_*|history\ *) return ;;
  esac
  _ZU_TERM_AT_PROMPT=""
  _zu_term_report_command "${BASH_COMMAND:-}"
}

_zu_term_precmd() {
  local exit_status=$?
  _zu_term_clear_command
  _zu_term_configure_history
  history -a 2>/dev/null || true
  _zu_term_osc7
  _ZU_TERM_AT_PROMPT=1
  return "$exit_status"
}

if [[ $- == *i* ]]; then
  _zu_term_configure_history
  case ";${PROMPT_COMMAND:-};" in
    *";_zu_term_precmd;"*) ;;
    *)
      if [[ -n "${PROMPT_COMMAND:-}" ]]; then
        PROMPT_COMMAND="_zu_term_precmd;${PROMPT_COMMAND}"
      else
        PROMPT_COMMAND="_zu_term_precmd"
      fi
      ;;
  esac
  trap '_zu_term_preexec' DEBUG
fi
