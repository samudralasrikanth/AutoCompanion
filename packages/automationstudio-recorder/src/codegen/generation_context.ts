import { CodeGenerationRequest } from '@automation-studio/types';

export class GenerationContext {
  public readonly request: CodeGenerationRequest;
  public readonly generationId: string;

  constructor(request: CodeGenerationRequest, generationId: string = 'gen-default') {
    this.request = request;
    this.generationId = generationId;
  }

  getRepositoryObject(objectId: string): any {
    return this.request.repository?.[objectId];
  }
}
