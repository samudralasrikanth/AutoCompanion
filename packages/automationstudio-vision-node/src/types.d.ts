declare module 'screenshot-desktop' {
  interface ScreenshotOptions {
    format?: string;
  }
  
  function screenshot(options?: ScreenshotOptions): Promise<Buffer>;
  namespace screenshot {
    export function listDisplays(): Promise<any[]>;
  }
  
  export = screenshot;
}
