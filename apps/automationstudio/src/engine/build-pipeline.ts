import { IScenario, ScenarioValidator, ScenarioLinter, ValidationWarning } from '@automation-studio/sdk';
import type { IVisualObject } from '@automation-studio/sdk/src/repository/object-repository';
import { PythonGenerator } from './generators/python-generator';
import { TypescriptGenerator } from './generators/typescript-generator';
import { SurfaceGenerator } from './generators/vision-generator';
import type { IGenerationProfile } from '@automation-studio/types';
import { BuildCache } from './build-cache';

export interface BuildOptions {
  forceBuild?: boolean;
  workspaceRoot: string;
  objects?: Record<string, IVisualObject>;
}

export interface BuildResult {
  success: boolean;
  skipped?: boolean;
  warnings: ValidationWarning[];
  lints: ValidationWarning[];
  generatedCode?: string;
  outputPath?: string;
}

export class BuildPipeline {
  private validator = new ScenarioValidator();
  private linter = new ScenarioLinter();

  public build(scenario: IScenario, profile: IGenerationProfile, options: BuildOptions): BuildResult {
    const cache = new BuildCache(options.workspaceRoot);
    const hash = cache.computeHash(scenario, profile);

    if (!options.forceBuild && cache.isCached(scenario.id, hash)) {
      return { success: true, skipped: true, warnings: [], lints: [] };
    }

    // 2. Validate
    const warnings = this.validator.validate(scenario);

    // 2.5 Lint
    const lints = this.linter.lint(scenario);

    // If there are errors (vs warnings), we fail the build here unless forced.
    const hasErrors = warnings.some(w => w.severity === 'error');
    if (hasErrors && !options.forceBuild) {
      return { success: false, warnings, lints };
    }

    // 3. Generate
    let generatedCode = '';
    if (profile.language === 'python' && profile.framework === 'playwright') {
      generatedCode = PythonGenerator.generatePython(scenario, options.objects);
    } else if (profile.language === 'typescript' && profile.framework === 'playwright') {
      generatedCode = TypescriptGenerator.generateTypescript(scenario, options.objects);
    } else if (profile.language === 'python' && (profile.framework === 'vision' || profile.framework === 'surface')) {
      generatedCode = SurfaceGenerator.generatePython(scenario, options.objects);
    } else {
      return { 
        success: false, 
        warnings: [...warnings, { severity: 'error', message: `Unsupported profile: ${profile.language}-${profile.framework}` }],
        lints 
      };
    }

    cache.updateCache(scenario.id, hash);

    return {
      success: true,
      warnings,
      lints,
      generatedCode
    };
  }
}
