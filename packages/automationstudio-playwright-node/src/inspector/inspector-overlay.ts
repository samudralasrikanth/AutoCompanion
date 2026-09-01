// This script is injected into the browser context.
// It tracks mouse movements and highlights elements, capturing clicks.
(function() {
  if ((window as any).__automation_studio_inspector_initialized) return;
  (window as any).__automation_studio_inspector_initialized = true;

  const overlay = document.createElement('div');
  overlay.style.position = 'absolute';
  overlay.style.pointerEvents = 'none';
  overlay.style.zIndex = '999999';
  overlay.style.backgroundColor = 'rgba(0, 150, 255, 0.3)';
  overlay.style.border = '2px solid rgba(0, 150, 255, 0.8)';
  overlay.style.transition = 'all 0.1s ease';
  overlay.style.display = 'none';
  document.body.appendChild(overlay);

  let currentElement: HTMLElement | null = null;

  document.addEventListener('mousemove', (e) => {
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement;
    if (!el || el === currentElement || el === overlay) return;
    
    currentElement = el;
    const rect = el.getBoundingClientRect();
    
    overlay.style.display = 'block';
    overlay.style.top = (rect.top + window.scrollY) + 'px';
    overlay.style.left = (rect.left + window.scrollX) + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';
  });

  function getXPath(el: HTMLElement): string {
    if (el.id) {
      return `//*[@id="${el.id}"]`;
    }
    if (el === document.body) {
      return '/html/body';
    }
    let ix = 0;
    const siblings = el.parentNode?.childNodes;
    if (siblings) {
      for (let i = 0; i < siblings.length; i++) {
        const sibling = siblings[i] as HTMLElement;
        if (sibling === el) {
          return getXPath(el.parentNode as HTMLElement) + '/' + el.tagName.toLowerCase() + '[' + (ix + 1) + ']';
        }
        if (sibling.nodeType === 1 && sibling.tagName === el.tagName) {
          ix++;
        }
      }
    }
    return '';
  }

  document.addEventListener('click', (e) => {
    if (!currentElement) return;
    
    e.preventDefault();
    e.stopPropagation();

    const attributes: Record<string, string> = {};
    for (let i = 0; i < currentElement.attributes.length; i++) {
      const attr = currentElement.attributes[i];
      attributes[attr.name] = attr.value;
    }

    const metadata = {
      tagName: currentElement.tagName.toLowerCase(),
      id: currentElement.id,
      name: currentElement.getAttribute('name') || undefined,
      role: currentElement.getAttribute('role') || undefined,
      xpath: getXPath(currentElement),
      classes: Array.from(currentElement.classList),
      text: currentElement.innerText?.substring(0, 50),
      attributes,
      isInteractive: true,
      isVisible: true
    };

    const locators: any[] = [];
    if (typeof (window as any).__automation_studio_element_selected === 'function') {
      (window as any).__automation_studio_element_selected({
        metadata,
        locators
      });
    }
  }, { capture: true });
})();
