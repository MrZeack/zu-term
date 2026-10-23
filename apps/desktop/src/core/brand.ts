import tauriConfig from '../../src-tauri/tauri.conf.json' with { type: 'json' };

export const APP_NAME = 'Zu Term';
export const APP_VERSION = tauriConfig.version;
export const APP_SLUG = 'zu-term';
export const APP_TERMINAL_ENV = 'ZU_TERM_TERMINAL';
export const APP_COMMAND_PREFIX = 'ZuTermCommand=';
export const APP_AGENT_PREFIX = 'ZuTermAgent=';
export const APP_WINDOW_PREFIX = 'zu-term-window-';
