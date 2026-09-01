import { promises as fs } from 'fs';
import { join } from 'path';
import { IObjectRepository, IVisualObject } from './object-repository';

export class FileSystemRepository implements IObjectRepository {
  private repositoryPath: string;

  constructor(workspaceRoot: string) {
    this.repositoryPath = join(workspaceRoot, 'repository');
  }

  public async saveObject(obj: IVisualObject): Promise<void> {
    const objPath = join(this.repositoryPath, obj.folderPath, obj.name);
    await fs.mkdir(objPath, { recursive: true }).catch(() => {});
    
    // Create necessary subdirectories
    await fs.mkdir(join(objPath, 'screenshots'), { recursive: true }).catch(() => {});
    
    const filePath = join(objPath, 'object.json');
    await fs.writeFile(filePath, JSON.stringify(obj, null, 2), 'utf8');
  }

  public async getObject(id: string): Promise<IVisualObject | undefined> {
    const all = await this.getAllObjects();
    return all.find(o => o.id === id);
  }

  public async getAllObjects(): Promise<IVisualObject[]> {
    const objects: IVisualObject[] = [];
    
    async function scan(dir: string) {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = join(dir, entry.name);
          if (entry.isDirectory()) {
            await scan(fullPath);
          } else if (entry.isFile() && entry.name === 'object.json') {
            try {
              const content = await fs.readFile(fullPath, 'utf8');
              objects.push(JSON.parse(content));
            } catch (e) {
              console.error(`Failed to parse ${fullPath}`, e);
            }
          }
        }
      } catch (e) {
        // Directory might not exist
      }
    }
    
    await scan(this.repositoryPath);
    return objects;
  }

  public async deleteObject(id: string): Promise<void> {
    const obj = await this.getObject(id);
    if (!obj) return;
    
    const objPath = join(this.repositoryPath, obj.folderPath, obj.name);
    await fs.rm(objPath, { recursive: true, force: true }).catch(() => {});
  }
}
