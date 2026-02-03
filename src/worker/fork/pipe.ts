/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

const uuid = (len = 4) => {
  try {
    const crypto = require('crypto');
    const bytes = crypto.randomBytes(Math.ceil(len / 2));
    return bytes.toString('hex').slice(0, len);
  } catch {
    const ts = Date.now().toString(16);
    return ts.slice(-len).padStart(len, '0');
  }
};

const callbackKey = (key: string) => key + '.callback';

class Deferred {
  resolve: (data: any) => void;
  reject: (data: any) => void;
  private _promise: Promise<any>;
  private key: string;
  constructor(key: string) {
    this._promise = new Promise((resolve, reject) => {
      this.resolve = (data: any) => {
        resolve(data);
      };
      this.reject = (data: any) => {
        reject(data);
      };
    });
    this.key = key;
  }
  promise() {
    return this._promise;
  }
  then(onfulfilled: (data: any) => void, onrejected?: (data: any) => void) {
    return this._promise.then(onfulfilled, onrejected);
  }
  catch(onrejected: (data: any) => void) {
    return this._promise.catch(onrejected);
  }
  finally(onfinally: () => void) {
    return this._promise.finally(onfinally);
  }
  with(promise: Promise<any>) {
    promise.then(this.resolve).catch(this.reject);
  }
  pipe(handler: (key: string, data: { data: any; state: 'fulfilled' | 'rejected' }) => void) {
    const key = callbackKey(this.key);
    return this.promise()
      .then((data) => handler(key, { data, state: 'fulfilled' }))
      .catch((data) => handler(key, { data, state: 'rejected' }));
  }
}

type THandler = (data: any, deferred?: Deferred) => void;

export class Pipe {
  listener: {
    [key: string]: Array<THandler>;
  } = {};
  isClose = false;
  constructor(master = false) {
    if (!master) {
      // Receive messages from main process
      if (process.parentPort) {
        process.parentPort.on('message', (event) => {
          const { type, data, pipeId } = event.data || {};
          // console.log("--------------->from main message", event.data);
          if (type) {
            const deferred = this.deferred(pipeId);
            if (pipeId) {
              deferred.pipe(this.call.bind(this)).catch((error: Error) => {
                console.error('Failed to pipe deferred call:', error);
              });
            }
            this.emit(type, data, deferred);
          }
        });
      }
    }
  }
  emit(name: string, data: any, deferred?: Deferred) {
    const listener = (this.listener[name] || []).slice();
    for (let i = 0, len = listener.length; i < len; i++) {
      listener[i](data, deferred);
    }
  }

  on(name: string, handler: THandler) {
    const events = this.listener[name] || (this.listener[name] = []);
    events.push(handler);
    return () => {
      this.off(name, handler);
    };
  }
  once(name: string, handler: THandler) {
    this.on(name, (...args) => {
      handler(...args);
      this.off(name, handler);
    });
  }
  deferred(key?: string) {
    return new Deferred(key);
  }
  callbackKey(key: string) {
    return callbackKey(key);
  }
  off(name: string, handler?: THandler) {
    if (!this.listener[name] || !handler) this.listener[name] = [];
    else this.listener[name] = this.listener[name].filter((h) => h !== handler);
  }
  /**
   * Send notification to main process
   * @param name Notification name
   * @param data Notification data
   * @param extPrams Extended parameters
   */
  call(name: string, data: any, extPrams: any = {}) {
    if (this.isClose) {
      console.log('---Main process has closed', name, 'execution failed!!');
      return;
    }
    if (!process.parentPort?.postMessage) {
      console.error('---Not a child process, cannot use main process event mechanism');
      return;
    }
    process.parentPort.postMessage({
      type: name,
      data: data,
      ...extPrams,
    });
  }
  // Send notification to main process and establish response mechanism
  callPromise<T = any>(name: string, data: any) {
    const pipeId = uuid(8);
    this.call(name, data, {
      pipeId,
    });
    const promise = new Promise<T>((resolve, reject) => {
      this.once(callbackKey(pipeId), (data) => {
        if (data.type === 'fulfilled') {
          resolve(data.data);
        } else {
          reject(data.data);
        }
      });
    });
    return promise;
  }
  log(...args: any[]) {
    this.call('log', args);
  }
  clear() {
    this.listener = {};
  }
}

export default new Pipe();
