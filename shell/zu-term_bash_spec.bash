#!/usr/bin/env bash
# Specs for shell/zu-term.bash: bash shell/zu-term_bash_spec.bash
set -u
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
failed=0

check() {
  local label="$1" got="$2" expected="$3"
  if [[ "$got" == "$expected" ]]; then
    printf 'ok   %s\n' "$label"
  else
    printf 'FAIL %s\n     expected %q\n     got      %q\n' "$label" "$expected" "$got"
    failed=1
  fi
}

tmp_parent="$(mktemp -d)"
dir="$tmp_parent/my app 100%"
mkdir -p "$dir"
cd "$dir" || exit 1

source "$here/zu-term.bash"

host="${HOSTNAME:-$(hostname)}"
encoded_dir="${dir//\%/%25}"
encoded_dir="${encoded_dir// /%20}"
check "bash osc7 encodes cwd as file URL" "$(_zu_term_osc7)" $'\e]7;file://'"${host}${encoded_dir}"$'\e\\'

ZU_TERM_HISTORY_FILE="$dir/pane-history.bash"
echo "echo historic-bash-cmd" > "$ZU_TERM_HISTORY_FILE"
_zu_term_configure_history
check "bash configures the pane-specific history file" "$HISTFILE" "$ZU_TERM_HISTORY_FILE"
check "bash ensures HISTSIZE is at least 10000" "$(( HISTSIZE >= 10000 ))" "1"
check "bash ensures HISTFILESIZE is at least 10000" "$(( HISTFILESIZE >= 10000 ))" "1"

check "bash reports codex as the active command" "$(_zu_term_report_command 'codex --dangerously-skip')" $'\e]1337;ZuTermCommand=codex\e\\\e]1337;ZuTermAgent=codex\e\\'
check "bash skips env assignments before the command" "$(_zu_term_report_command 'env FOO=bar claude')" $'\e]1337;ZuTermCommand=claude\e\\\e]1337;ZuTermAgent=claude\e\\'
check "bash reports codex resume IDs with single quotes" "$(_zu_term_report_command "codex resume 'codex-123'")" $'\e]1337;ZuTermCommand=codex\e\\\e]1337;ZuTermAgent=codex|codex-123\e\\'
check "bash reports claude --resume=ID with double quotes" "$(_zu_term_report_command 'claude --resume="claude-99"')" $'\e]1337;ZuTermCommand=claude\e\\\e]1337;ZuTermAgent=claude|claude-99\e\\'
check "bash reports kiro resume IDs" "$(_zu_term_report_command 'kiro-cli chat --resume-id kiro-123')" $'\e]1337;ZuTermCommand=kiro-cli\e\\\e]1337;ZuTermAgent=kiro|kiro-123\e\\'
check "bash reports muse resume IDs" "$(_zu_term_report_command 'muse resume muse-123')" $'\e]1337;ZuTermCommand=muse\e\\\e]1337;ZuTermAgent=muse|muse-123\e\\'
check "bash reports antigravity conversation IDs" "$(_zu_term_report_command 'agy --conversation conv-123')" $'\e]1337;ZuTermCommand=agy\e\\\e]1337;ZuTermAgent=antigravity|conv-123\e\\'
check "bash clears the agent when command is not an agent" "$(_zu_term_report_command 'make install')" $'\e]1337;ZuTermCommand=make\e\\\e]1337;ZuTermAgent=\e\\'
check "bash clears only command metadata at prompt" "$(_zu_term_clear_command)" $'\e]1337;ZuTermCommand=\e\\'

# An existing DEBUG trap (starship, a user's own) keeps running with ours.
chained="$(
  prev_hits=0
  trap 'prev_hits=$((prev_hits + 1)); note='\''it'\''"'\''"'\''s'\''' DEBUG
  _zu_term_install_hooks
  _ZU_TERM_AT_PROMPT=1
  true
  trap - DEBUG
  printf '|%s|%s' "$(( prev_hits > 1 ))" "$note"
)"
check "bash chains an existing DEBUG trap" "$chained" $'\e]1337;ZuTermCommand=true\e\\\e]1337;ZuTermAgent=\e\\|1|it\'s'

# With bash-preexec (atuin and others need it), register there instead.
with_preexec="$(
  bash_preexec_imported=defined
  preexec_functions=(user_preexec)
  precmd_functions=(user_precmd)
  PROMPT_COMMAND='user_prompt'
  _zu_term_install_hooks
  _zu_term_install_hooks
  printf '%s;' "${preexec_functions[*]}" "${precmd_functions[*]}" "$PROMPT_COMMAND" "$(trap -p DEBUG)"
)"
check "bash registers in bash-preexec once without its own trap" "$with_preexec" "user_preexec _zu_term_bp_preexec;user_precmd _zu_term_precmd;user_prompt;;"
check "bash-preexec hands the full command line" "$(_zu_term_bp_preexec 'FOO=1 claude --resume s-1')" $'\e]1337;ZuTermCommand=claude\e\\\e]1337;ZuTermAgent=claude|s-1\e\\'

rm -rf "$tmp_parent"
exit "$failed"
