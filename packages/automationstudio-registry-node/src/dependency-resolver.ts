import type { AutomationPluginManifest } from '@automation-studio/types';
import { VersionChecker } from './version-checker';

export class DependencyResolver {
  public resolveOrder(manifests: AutomationPluginManifest[]): AutomationPluginManifest[] {
    const resolved: string[] = [];
    const unresolved: string[] = [];
    const order: AutomationPluginManifest[] = [];
    
    const manifestMap = new Map<string, AutomationPluginManifest>();
    for (const m of manifests) {
      manifestMap.set(m.id, m);
    }

    const resolve = (node: AutomationPluginManifest) => {
      unresolved.push(node.id);
      
      const deps = node.dependencies || {};
      for (const [depId, versionRange] of Object.entries(deps)) {
        if (!resolved.includes(depId)) {
          if (unresolved.includes(depId)) {
            throw new Error(`Circular dependency detected: ${node.id} -> ${depId}`);
          }
          
          const depManifest = manifestMap.get(depId);
          if (!depManifest) {
            throw new Error(`Plugin ${node.id} requires missing dependency ${depId}`);
          }
          
          if (!VersionChecker.isCompatible(versionRange, depManifest.version)) {
            throw new Error(`Plugin ${node.id} requires ${depId}@${versionRange}, but found ${depManifest.version}`);
          }
          
          resolve(depManifest);
        }
      }
      
      resolved.push(node.id);
      unresolved.splice(unresolved.indexOf(node.id), 1);
      order.push(node);
    };

    for (const manifest of manifests) {
      if (!resolved.includes(manifest.id)) {
        resolve(manifest);
      }
    }

    return order;
  }
}
