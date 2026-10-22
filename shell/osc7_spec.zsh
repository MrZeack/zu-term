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
check "osc7 encodes cwd as file URL" "$(_console_osc7)" $'\e]7;file://'"${HOST}${${dir//\%/%25}// /%20}"$'\e\\'

check "registers precmd hook" "${precmd_functions[(r)_console_osc7]}" "_console_osc7"
check "registers chpwd hook" "${chpwd_functions[(r)_console_osc7]}" "_console_osc7"
check "reports codex as the active command" "$(_console_zylo_preexec 'codex --dangerously-skip')" $'\e]1337;ZyloCommand=codex\e\\'
check "skips env assignments before the command" "$(_console_zylo_preexec 'env FOO=bar claude')" $'\e]1337;ZyloCommand=claude\e\\'
check "clears the active command at the prompt" "$(_console_zylo_precmd)" $'\e]1337;ZyloCommand=\e\\'

rm -rf "${dir:h}"
exit $failed
