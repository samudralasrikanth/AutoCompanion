export enum LocatorStrategy {
  CSS = 'css',
  XPATH = 'xpath',
  ID = 'id',
  NAME = 'name',
  ACCESSIBILITY_ID = 'accessibility_id',
  IMAGE = 'image',
  OCR = 'ocr',
}

export interface ILocator {
  strategy: LocatorStrategy;
  value: string;
}

export interface IUIElement {
  id: string;
  name: string;
  description?: string;
  locators: ILocator[];
  parent?: string; // ID of the parent element or screen
}

export interface IObjectRepository {
  getElement(id: string): IUIElement | undefined;
  addElement(element: IUIElement): void;
  removeElement(id: string): void;
  getAllElements(): IUIElement[];
}

export class ObjectRepository implements IObjectRepository {
  private elements = new Map<string, IUIElement>();

  public getElement(id: string): IUIElement | undefined {
    return this.elements.get(id);
  }

  public addElement(element: IUIElement): void {
    this.elements.set(element.id, element);
  }

  public removeElement(id: string): void {
    this.elements.delete(id);
  }

  public getAllElements(): IUIElement[] {
    return Array.from(this.elements.values());
  }
}
