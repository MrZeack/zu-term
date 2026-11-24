# Zu Term shell integration for fish.
# Loaded automatically via XDG_DATA_DIRS (fish/vendor_conf.d/zu-term.fish).

if set -q ZU_TERM_USER_XDG_DATA_DIRS
    set -gx XDG_DATA_DIRS $ZU_TERM_USER_XDG_DATA_DIRS
    set -e ZU_TERM_USER_XDG_DATA_DIRS
else
    set -e XDG_DATA_DIRS
end

if not status is-interactive; or not set -q ZU_TERM_TERMINAL
    exit 0
end

if set -q ZU_TERM_HISTORY_ID; and string match -qr '^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$' -- $ZU_TERM_HISTORY_ID
    # fish only accepts letters, digits and `_` in a history name.
    set -g fish_history "zu_term_"(string replace -ra '[^A-Za-z0-9_]' _ -- $ZU_TERM_HISTORY_ID)
end

function _zu_term_osc7 --on-variable PWD --on-event fish_prompt
    set -l host (hostname 2>/dev/null)
    set -l path_enc (string replace -a '%' '%25' -- $PWD)
    set path_enc (string replace -a ' ' '%20' -- $path_enc)
    printf '\e]7;file://%s%s\e\\' "$host" "$path_enc"
end

function _zu_term_preexec --on-event fish_preexec
    set -l words (string split -n ' ' -- $argv[1])
    set -l count (count $words)
    set -l idx 1
    set -l cmd ''
    set -l provider ''
    set -l session ''

    while test $idx -le $count
        set -l word $words[$idx]
        if string match -qr '^[A-Za-z_][A-Za-z0-9_]*=' -- $word
            set idx (math $idx + 1)
            continue
        end
        switch $word
            case command env exec nohup sudo time
                set idx (math $idx + 1)
                continue
        end
        set cmd (string replace -r '^.*/' '' -- $word)
        break
    end

    if string match -qr '^[A-Za-z0-9][A-Za-z0-9._+-]*$' -- $cmd
        printf '\e]1337;ZuTermCommand=%s\e\\' "$cmd"
    else
        printf '\e]1337;ZuTermCommand=\e\\'
    end

    switch $cmd
        case codex
            set provider codex
        case claude claude-code
            set provider claude
        case kiro kiro-cli
            set provider kiro
        case muse
            set provider muse
        case agy antigravity
            set provider antigravity
    end

    if test -n "$provider"
        set -l j (math $idx + 1)
        while test $j -le $count
            set -l token $words[$j]
            switch $token
                case resume -r --resume --resume-id --conversation
                    set -l next_idx (math $j + 1)
                    if test $next_idx -le $count
                        set -l next $words[$next_idx]
                        if not string match -qr '^-' -- $next
                            set session $next
                        end
                    end
                    break
                case '--resume=*' '--resume-id=*' '--conversation=*'
                    set session (string replace -r '^[^=]*=' '' -- $token)
                    break
            end
            set j (math $j + 1)
        end

        set session (string trim -c "'" -- (string trim -c '"' -- $session))
        if test -n "$session"; and string match -qr '^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$' -- $session
            printf '\e]1337;ZuTermAgent=%s|%s\e\\' "$provider" "$session"
        else
            printf '\e]1337;ZuTermAgent=%s\e\\' "$provider"
        end
    else
        printf '\e]1337;ZuTermAgent=\e\\'
    end
end

function _zu_term_precmd --on-event fish_postexec --on-event fish_prompt
    printf '\e]1337;ZuTermCommand=\e\\'
end
