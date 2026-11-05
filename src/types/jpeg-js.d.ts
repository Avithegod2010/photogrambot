declare module "jpeg-js" {
  export interface DecodeOptions {
    useTArray?: boolean;
    formatAsRGBA?: boolean;
    maxMemoryUsageInMB?: number;
  }
  export interface RawImageData {
    width: number;
    height: number;
    data: Uint8Array;
  }
  export function decode(
    data: Uint8Array | ArrayLike<number>,
    options?: DecodeOptions
  ): RawImageData;
}
