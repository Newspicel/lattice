import type { ElectronAPI } from '@electron-toolkit/preload';
import type { NativeApi } from './index';

declare global {
  interface Window {
    electron: ElectronAPI;
    native: NativeApi;
  }
}

export {};
