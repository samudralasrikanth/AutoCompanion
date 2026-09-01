// This script is injected into the browser context for recording actions.
(function() {
  if ((window as any).__automation_studio_recorder_initialized) return;
  (window as any).__automation_studio_recorder_initialized = true;

  const overlay = document.createElement('div');
  overlay.style.position = 'absolute';
  overlay.style.pointerEvents = 'none';
  overlay.style.zIndex = '999999';
  overlay.style.backgroundColor = 'rgba(255, 100, 100, 0.2)';
  overlay.style.border = '2px solid rgba(255, 0, 0, 0.5)';
  overlay.style.transition = 'all 0.1s ease';
  overlay.style.display = 'none';
  document.body.appendChild(overlay);

  let currentElement: HTMLElement | null = null;

  document.addEventListener('mousemove', (e) => {
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement;
    if (!el || el === overlay) return;
    
    currentElement = el;
    const rect = el.getBoundingClientRect();
    
    overlay.style.display = 'block';
    overlay.style.top = (rect.top + window.scrollY) + 'px';
    overlay.style.left = (rect.left + window.scrollX) + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';
  });

  function getXPath(el: HTMLElement): string {
    if (el.id) return `//*[@id="${el.id}"]`;
    if (el === document.body) return '/html/body';
    let ix = 0;
    const siblings = el.parentNode?.childNodes;
    if (siblings) {
      for (let i = 0; i < siblings.length; i++) {
        const sibling = siblings[i] as HTMLElement;
        if (sibling === el) {
          return getXPath(el.parentNode as HTMLElement) + '/' + el.tagName.toLowerCase() + '[' + (ix + 1) + ']';
        }
        if (sibling.nodeType === 1 && sibling.tagName === el.tagName) ix++;
      }
    }
    return '';
  }

  function generateLocator(el: HTMLElement): { strategy: string, value: string } {
    if (el.hasAttribute('data-testid')) return { strategy: 'data-testid', value: el.getAttribute('data-testid')! };
    if (el.id) return { strategy: 'id', value: el.id };
    if (el.getAttribute('name')) return { strategy: 'name', value: el.getAttribute('name')! };
    return { strategy: 'xpath', value: getXPath(el) };
  }

  function reportAction(type: string, el: HTMLElement, extra?: any) {
    if (typeof (window as any).__automation_studio_record_action === 'function') {
      const loc = generateLocator(el);
      (window as any).__automation_studio_record_action({
        type,
        locatorStrategy: loc.strategy,
        locator: loc.value,
        timestamp: Date.now(),
        ...extra
      });
    }
  }

  document.addEventListener('click', (e) => {
    if (!currentElement) return;
    reportAction('click', currentElement);
  }, { capture: true });

  document.addEventListener('input', (e) => {
    const el = e.target as HTMLElement;
    reportAction('input', el, { value: (el as any).value });
  }, { capture: true });

  document.addEventListener('contextmenu', (e) => {
    if (!currentElement) return;
    reportAction('rightClick', currentElement);
  }, { capture: true });

  document.addEventListener('change', (e) => {
    const el = e.target as HTMLElement;
    if (el.tagName === 'SELECT') {
      reportAction('select', el, { value: (el as HTMLSelectElement).value });
    } else if (el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'checkbox') {
      reportAction((el as HTMLInputElement).checked ? 'check' : 'uncheck', el);
    }
  }, { capture: true });

  document.addEventListener('dragstart', (e) => {
    const el = e.target as HTMLElement;
    reportAction('dragstart', el); // Would pair with drop in real implementation
  }, { capture: true });

  document.addEventListener('drop', (e) => {
    const el = e.target as HTMLElement;
    reportAction('drop', el); 
  }, { capture: true });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === 'Tab' || e.key === 'Escape') {
      const el = e.target as HTMLElement;
      reportAction('keydown', el, { key: e.key });
    }
  }, { capture: true });
})();
