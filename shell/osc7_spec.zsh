#!/usr/bin/env zsh
# Specs for shell/osc7.zsh: zsh shell/osc7_spec.zsh
here=${0:A:h}
failed=0
check() {
  if [[ "$2" == "$3" ]]; then print "ok   $1"; else print "FAIL $1\n     expected ${(q+)3}\n     got      ${(q+)2}"; failed=1; fi
}

dir=$(mktemp -d)/"my app 100%"
mkdir -p "$dir"
cd "$dir"
source "$here/osc7.zsh"
check "osc7 encodes cwd as file URL" "$(_zu_term_osc7)" $'\e]7;file://'"${HOST}${${dir//\%/%25}// /%20}"$'\e\\'

ZU_TERM_HISTORY_FILE="$dir/pane-history.zsh"
_zu_term_configure_history
check "configures the pane-specific history file" "$HISTFILE" "$ZU_TERM_HISTORY_FILE"

check "registers precmd hook" "${precmd_functions[(r)_zu_term_osc7]}" "_zu_term_osc7"
check "registers chpwd hook" "${chpwd_functions[(r)_zu_term_osc7]}" "_zu_term_osc7"
check "reports codex as the active command" "$(_zu_term_preexec 'codex --dangerously-skip')" $'\e]1337;ZuTermCommand=codex\e\\\e]1337;ZuTermAgent=codex\e\\'
check "skips env assignments before the command" "$(_zu_term_preexec 'env FOO=bar claude')" $'\e]1337;ZuTermCommand=claude\e\\\e]1337;ZuTermAgent=claude\e\\'
check "reports codex resume IDs" "$(_zu_term_preexec 'codex resume codex-123')" $'\e]1337;ZuTermCommand=codex\e\\\e]1337;ZuTermAgent=codex|codex-123\e\\'
check "reports a new claude session without an ID" "$(_zu_term_preexec 'claude')" $'\e]1337;ZuTermCommand=claude\e\\\e]1337;ZuTermAgent=claude\e\\'
check "reports kiro resume IDs" "$(_zu_term_preexec 'kiro-cli chat --resume-id kiro-123')" $'\e]1337;ZuTermCommand=kiro-cli\e\\\e]1337;ZuTermAgent=kiro|kiro-123\e\\'
check "reports muse resume IDs" "$(_zu_term_preexec 'muse resume muse-123')" $'\e]1337;ZuTermCommand=muse\e\\\e]1337;ZuTermAgent=muse|muse-123\e\\'
check "reports antigravity conversation IDs" "$(_zu_term_preexec 'agy --conversation conversation-123')" $'\e]1337;ZuTermCommand=agy\e\\\e]1337;ZuTermAgent=antigravity|conversation-123\e\\'
check "starts antigravity without an explicit ID" "$(_zu_term_preexec 'agy --continue')" $'\e]1337;ZuTermCommand=agy\e\\\e]1337;ZuTermAgent=antigravity\e\\'
check "clears agent metadata for a normal command" "$(_zu_term_preexec 'ls -la')" $'\e]1337;ZuTermCommand=ls\e\\\e]1337;ZuTermAgent=\e\\'
check "clears command and agent metadata at the prompt" "$(_zu_term_precmd)" $'\e]1337;ZuTermCommand=\e\\\e]1337;ZuTermAgent=\e\\'

rm -rf "${dir:h}"
exit $failed
