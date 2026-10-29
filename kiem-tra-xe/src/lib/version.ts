import changelog from '../changelog.json';

export const APP_NAME = 'Kiểm tra xe';
export const APP_VERSION = changelog[0]?.version ?? '0.0.0';
export const APP_UPDATED = changelog[0]?.date ?? '';
