function $<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
}

export interface OverlayParts {
  root: HTMLElement;
  title: HTMLElement;
  sub: HTMLElement;
  btn: HTMLButtonElement;
  handleInput: HTMLInputElement;
}

export function getOverlay(): OverlayParts {
  return {
    root: $('overlay'),
    title: $('ov-title'),
    sub: $('ov-sub'),
    btn: $('ov-btn') as HTMLButtonElement,
    handleInput: $('handle-input') as HTMLInputElement,
  };
}

export interface OverlayContent {
  title: string;
  /** HTML content for the sub paragraph. */
  subHtml: string;
  btnText: string;
  showHandleInput: boolean;
}

export function showOverlay(content: OverlayContent): void {
  const o = getOverlay();
  o.title.textContent = content.title;
  o.sub.innerHTML = content.subHtml;
  o.btn.textContent = content.btnText;
  o.handleInput.style.display = content.showHandleInput ? '' : 'none';
  o.root.classList.add('show');
}

export function hideOverlay(): void {
  getOverlay().root.classList.remove('show');
}
