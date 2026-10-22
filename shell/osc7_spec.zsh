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

rm -rf "${dir:h}"
exit $failed
