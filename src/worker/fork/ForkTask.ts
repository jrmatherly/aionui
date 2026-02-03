/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Child process instance
/**
 * Provides process startup
 * Provides main/child process communication functionality
 */

import { uuid } from '@/renderer/utils/common';
import type { UtilityProcess } from 'electron';
import { app, utilityProcess } from 'electron';
import { Pipe } from './pipe';

/**
 * Get working directory for worker process
 *
 * In packaged environment, needs to point to app.asar.unpacked directory
 * so aioncli-core can find WASM files
 */
function getWorkerCwd(): string {
  if (app.isPackaged) {
    // Packaged: app.getAppPath() returns .../Resources/app.asar
    // We need the .../Resources/app.asar.unpacked directory
    const appPath = app.getAppPath();
    return appPath.replace('app.asar', 'app.asar.unpacked');
  }
  // Development: use project root directory
  return process.cwd();
}

export class ForkTask<Data> extends Pipe {
  protected path = '';
  protected data: Data;
  protected fcp: UtilityProcess | undefined;
  private killFn: () => void;
  private enableFork: boolean;
  constructor(path: string, data: Data, enableFork = true) {
    super(true);
    this.path = path;
    this.data = data;
    this.enableFork = enableFork;
    this.killFn = () => {
      this.kill();
    };
    process.on('exit', this.killFn);
    if (this.enableFork) this.init();
  }
  kill() {
    if (this.fcp) {
      this.fcp.kill();
    }
    process.off('exit', this.killFn);
  }
  protected init() {
    // Pass cwd to ensure worker can correctly resolve node_modules paths (for WASM files etc.)
    const workerCwd = getWorkerCwd();
    const fcp = utilityProcess.fork(this.path, [], {
      cwd: workerCwd,
    });
    // Receive messages sent from child process
    fcp.on('message', (e: IForkData) => {
      // console.log("---------receive message from child process>", e);
      // Receive child process messages
      if (e.type === 'complete') {
        fcp.kill();
        this.emit('complete', e.data);
      } else if (e.type === 'error') {
        fcp.kill();
        this.emit('error', e.data);
      } else {
        // clientId serves as the key for main/child process communication
        // If clientId exists, send message to the specified channel
        const deferred = this.deferred(e.pipeId);
        if (e.pipeId) {
          // If callback exists, send callback information to child process
          Promise.resolve(deferred.pipe(this.postMessage.bind(this))).catch((error) => {
            console.error('Failed to pipe message:', error);
          });
        }
        return this.emit(e.type, e.data, deferred);
      }
    });
    fcp.on('error', (err) => {
      this.emit('error', err);
    });
    this.fcp = fcp;
  }
  start() {
    if (!this.enableFork) return Promise.resolve();
    const { data } = this;
    return this.postMessagePromise('start', data);
  }
  // Send message to child process and wait for callback
  protected postMessagePromise(type: string, data: any) {
    return new Promise<any>((resolve, reject) => {
      const pipeId = uuid(8);
      // console.log("---------send message>", this.callbackKey(pipeId), type, data);
      this.once(this.callbackKey(pipeId), (data) => {
        // console.log("---------child process message callback listener>", data);
        if (data.state === 'fulfilled') {
          resolve(data.data);
        } else {
          reject(data.data);
        }
      });
      this.postMessage(type, data, { pipeId });
    });
  }
  // Send callback to child process
  postMessage(type: string, data: any, extPrams: Record<string, any> = {}) {
    if (!this.fcp) throw new Error('fork task not enabled');
    this.fcp.postMessage({ type, data, ...extPrams });
  }
}

interface IForkData {
  type: 'complete' | 'error' | string;
  data: any;
  pipeId?: string;
  [key: string]: any;
}
