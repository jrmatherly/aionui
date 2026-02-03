/**
 * Type declarations for pptx2json
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- Third-party library without shipped types */
declare module 'pptx2json' {
  export default class PPTX2Json {
    constructor();
    toJson(filePath: string): Promise<any>;
    toPPTX(json: any, options?: { file?: string }): Promise<Buffer>;
    getMaxSlideIds(json: any): { id: number; rid: number };
    getSlideLayoutTypeHash(json: any): Record<string, string>;
  }
}
