// WebUI status interface
export interface WebUIStatus {
  running: boolean;
  port: number;
  allowRemote: boolean;
  localUrl: string;
  networkUrl?: string;
  lanIP?: string;
  adminUsername: string;
  initialPassword?: string;
}

// WebUI reset password result
export interface WebUIResetPasswordResult {
  success: boolean;
  newPassword?: string;
  msg?: string;
}

// WebUI get status result
export interface WebUIGetStatusResult {
  success: boolean;
  data?: WebUIStatus;
  msg?: string;
}

// WebUI change password result
export interface WebUIChangePasswordResult {
  success: boolean;
  msg?: string;
}

// WebUI generate QR token result
export interface WebUIGenerateQRTokenResult {
  success: boolean;
  data?: {
    token: string;
    expiresAt: number;
    qrUrl: string;
  };
  msg?: string;
}

export interface ElectronBridgeAPI {
  emit: (name: string, data: unknown) => Promise<unknown> | void;
  on: (callback: (event: { value: string }) => void) => void;
  // Get absolute path for dragged file/directory
  getPathForFile?: (file: File) => string;
  // Direct IPC calls (bypass bridge library)
  webuiResetPassword?: () => Promise<WebUIResetPasswordResult>;
  webuiGetStatus?: () => Promise<WebUIGetStatusResult>;
  // Change password (no current password required)
  webuiChangePassword?: (newPassword: string) => Promise<WebUIChangePasswordResult>;
  // Generate QR token
  webuiGenerateQRToken?: () => Promise<WebUIGenerateQRTokenResult>;
}

declare global {
  interface Window {
    electronAPI?: ElectronBridgeAPI;
  }
}

export {};
