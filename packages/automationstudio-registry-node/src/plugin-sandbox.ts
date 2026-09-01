export class PluginSandbox {
  /**
   * Wraps a plugin instance in a logical sandbox.
   * Intercepts all method calls and catches thrown errors to prevent 
   * a single faulty plugin from crashing the entire IDE or Engine.
   */
  public static createSandbox<T extends object>(pluginInstance: T, pluginId: string, logger: any): T {
    return new Proxy(pluginInstance, {
      get(target: any, prop: string | symbol) {
        const originalMethod = target[prop];
        
        if (typeof originalMethod === 'function') {
          return function (...args: any[]) {
            try {
              const result = originalMethod.apply(target, args);
              
              if (result instanceof Promise) {
                return result.catch((err: any) => {
                  logger?.error?.(`[Sandbox] Plugin ${pluginId} threw an async error in ${String(prop)}:`, err);
                  throw new Error(`Plugin error in ${String(prop)}: ${err.message}`);
                });
              }
              
              return result;
            } catch (err: any) {
              logger?.error?.(`[Sandbox] Plugin ${pluginId} threw a sync error in ${String(prop)}:`, err);
              throw new Error(`Plugin error in ${String(prop)}: ${err.message}`);
            }
          };
        }
        
        return originalMethod;
      }
    });
  }
}
