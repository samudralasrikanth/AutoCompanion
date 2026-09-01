import { IScenario } from '@automation-studio/sdk';
import * as crypto from 'crypto';

export interface IAiService {
  generateScenario(prompt: string): Promise<IScenario>;
}

export class MockAiService implements IAiService {
  public async generateScenario(prompt: string): Promise<IScenario> {
    const id = crypto.randomUUID();
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // A simple mock parser based on keywords
    const steps: any[] = [];
    const lowerPrompt = prompt.toLowerCase();
    
    if (lowerPrompt.includes('login') || lowerPrompt.includes('log in')) {
      steps.push({
        id: crypto.randomUUID(),
        type: 'navigate',
        parameters: [{ name: 'url', value: 'https://example.com/login' }],
        description: 'Navigate to login page'
      });
      steps.push({
        id: crypto.randomUUID(),
        type: 'type',
        target: '#username',
        parameters: [{ name: 'value', value: 'user@example.com' }],
        description: 'Enter username'
      });
      steps.push({
        id: crypto.randomUUID(),
        type: 'type',
        target: '#password',
        parameters: [{ name: 'value', value: 'password123' }],
        description: 'Enter password'
      });
      steps.push({
        id: crypto.randomUUID(),
        type: 'click',
        target: '#login-button',
        description: 'Click login button'
      });
      steps.push({
        id: crypto.randomUUID(),
        type: 'waitNavigation',
        description: 'Wait for dashboard to load'
      });
    } else if (lowerPrompt.includes('api') || lowerPrompt.includes('fetch')) {
      steps.push({
        id: crypto.randomUUID(),
        type: 'apiRequest',
        parameters: [
          { name: 'method', value: 'GET' },
          { name: 'url', value: 'https://api.example.com/data' }
        ],
        description: 'Fetch data from API'
      });
      steps.push({
        id: crypto.randomUUID(),
        type: 'assertResponseStatus',
        parameters: [{ name: 'status', value: '200' }],
        description: 'Assert successful response'
      });
    } else {
      steps.push({
        id: crypto.randomUUID(),
        type: 'navigate',
        parameters: [{ name: 'url', value: 'https://google.com' }],
        description: 'Navigate to default page'
      });
    }

    const title = prompt.length > 30 ? prompt.substring(0, 30) + '...' : prompt;

    return {
      id,
      name: `AI Generated: ${title}`,
      description: `Generated from prompt: "${prompt}"`,
      steps,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }
}
