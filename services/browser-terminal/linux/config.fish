fish_add_path --global /usr/local/bin /usr/local/sbin /usr/sbin /sbin
status is-interactive; or return

set -gx TERM xterm-256color
set -gx LANG C.UTF-8
set -gx TERM_PROGRAM wterm
set -g fish_greeting
alias ll 'ls -lah'

if not set -q TMUX
    if test "$COLUMNS" -lt 76
        neofetch --off --colors 3 7 7 3 7 7 --disable gpu resolution de wm wm_theme theme icons packages
    else
        neofetch --ascii_colors 3 --colors 3 7 7 3 7 7 --disable gpu resolution de wm wm_theme theme icons packages
    end
end

# Keep the first prompt lightweight; the full Oh My Posh prompt remains available.
function fish_prompt
    set_color yellow
    printf '%s@%s ' "$USER" "$hostname"
    set_color normal
    printf '%s' (prompt_pwd)
    set_color yellow
    printf ' > '
    set_color normal
end

function posh --description 'Enable the Oh My Posh prompt'
    oh-my-posh init fish --config "$HOME/.config/oh-my-posh/orange.omp.json" | source
end
zoxide init fish | source

function __browser_prompt_marker --on-event fish_prompt
    printf '\033]133;A\007'
end
