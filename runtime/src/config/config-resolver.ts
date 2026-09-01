export interface RuntimeConfiguration {
  engine: {
    parallelism: number;
    timeoutMs: number;
    continueOnFailure: boolean;
  };
  reporting: {
    formats: string[];
    outputDir: string;
  };
  variables: Record<string, unknown>;
  [key: string]: unknown;
}

export type ConfigSource = 'global' | 'workspace' | 'project' | 'scenario' | 'cli';

export class ConfigResolver {
  private configs: Map<ConfigSource, Partial<RuntimeConfiguration>> = new Map();

  /**
   * Adds a configuration layer. Layers added later have higher precedence
   * when calling `resolve()`, provided we resolve in order: 
   * global -> workspace -> project -> scenario -> cli.
   */
  public addLayer(source: ConfigSource, config: Partial<RuntimeConfiguration>): void {
    this.configs.set(source, config);
  }

  /**
   * Resolves the final configuration by merging all available layers.
   */
  public resolve(): RuntimeConfiguration {
    const baseConfig: RuntimeConfiguration = {
      engine: {
        parallelism: 1,
        timeoutMs: 300000, // 5 mins
        continueOnFailure: false,
      },
      reporting: {
        formats: ['json'],
        outputDir: 'reports',
      },
      variables: {},
    };

    const sources: ConfigSource[] = ['global', 'workspace', 'project', 'scenario', 'cli'];
    let merged = { ...baseConfig };

    for (const source of sources) {
      const layer = this.configs.get(source);
      if (layer) {
        merged = this.deepMerge(merged, layer);
      }
    }

    return merged;
  }

  private deepMerge<T>(target: T, source: Partial<T>): T {
    if (!source) return target;
    const output = { ...target };
    
    for (const key of Object.keys(source)) {
      if (source[key as keyof typeof source] instanceof Object && key in (target as any) && !Array.isArray(source[key as keyof typeof source])) {
        output[key as keyof T] = this.deepMerge(
          (target as any)[key],
          (source as any)[key]
        ) as any;
      } else {
        output[key as keyof T] = (source as any)[key];
      }
    }
    
    return output;
  }
}
