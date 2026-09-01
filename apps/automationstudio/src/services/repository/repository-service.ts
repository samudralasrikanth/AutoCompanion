import { IObjectRepository, IVisualObject } from '@automation-studio/sdk/src/repository/object-repository';
import * as path from 'path';
import { promises as fs } from 'fs';

export class RepositoryEditorService {
  constructor(private readonly repo: IObjectRepository, private readonly workspaceRoot: string) {}

  public async renameObject(id: string, newName: string): Promise<void> {
    const obj = await this.repo.getObject(id);
    if (!obj) throw new Error('Object not found');

    const oldPath = path.join(this.workspaceRoot, 'repository', obj.folderPath, obj.name);
    const newPath = path.join(this.workspaceRoot, 'repository', obj.folderPath, newName);

    // Physically rename folder
    await fs.rename(oldPath, newPath);

    // Update object metadata
    obj.name = newName;
    
    // We rewrite the JSON in the new location manually as the saveObject will assume folder structure
    const filePath = path.join(newPath, 'object.json');
    await fs.writeFile(filePath, JSON.stringify(obj, null, 2), 'utf8');
  }

  public async mergeObjects(sourceId: string, targetId: string): Promise<void> {
    const source = await this.repo.getObject(sourceId);
    const target = await this.repo.getObject(targetId);
    
    if (!source || !target) throw new Error('Source or target object not found');

    // Merge training images
    if (source.assets?.trainingImages) {
        target.assets = target.assets || { trainingImages: [], screenshots: [] };
        target.assets.trainingImages.push(...source.assets.trainingImages);
    }

    await this.repo.saveObject(target);
    await this.repo.deleteObject(sourceId);
  }

  public async replaceUsages(oldId: string, newId: string): Promise<void> {
    const scenariosDir = path.join(this.workspaceRoot, 'scenarios');
    try {
        const files = await fs.readdir(scenariosDir);
        for (const file of files) {
            if (file.endsWith('.scenario.json')) {
                const fullPath = path.join(scenariosDir, file);
                const content = await fs.readFile(fullPath, 'utf8');
                
                // Simple string replacement for now. A robust AST parser should be used in production.
                const updated = content.replace(new RegExp(`"${oldId}"`, 'g'), `"${newId}"`);
                
                if (updated !== content) {
                    await fs.writeFile(fullPath, updated, 'utf8');
                }
            }
        }
    } catch (e) {
        // Scenarios dir might not exist
    }
  }
}
