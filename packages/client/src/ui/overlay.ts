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
  menuBtn: HTMLButtonElement;
  handleInput: HTMLInputElement;
}

export function getOverlay(): OverlayParts {
  return {
    root: $('overlay'),
    title: $('ov-title'),
    sub: $('ov-sub'),
    btn: $('ov-btn') as HTMLButtonElement,
    menuBtn: $('ov-btn-menu') as HTMLButtonElement,
    handleInput: $('handle-input') as HTMLInputElement,
  };
}

export interface OverlayContent {
  title: string;
  /** HTML content for the sub paragraph. */
  subHtml: string;
  btnText: string;
  showHandleInput: boolean;
  /** When set, also shows the secondary "MAIN MENU" button with this label. */
  menuBtnText?: string;
}

export function showOverlay(content: OverlayContent): void {
  const o = getOverlay();
  o.title.textContent = content.title;
  o.sub.innerHTML = content.subHtml;
  o.btn.textContent = content.btnText;
  o.handleInput.style.display = content.showHandleInput ? '' : 'none';
  if (content.menuBtnText) {
    o.menuBtn.textContent = content.menuBtnText;
    o.menuBtn.style.display = 'block';
  } else {
    o.menuBtn.style.display = 'none';
  }
  o.root.classList.add('show');
}

export function hideOverlay(): void {
  const o = getOverlay();
  o.menuBtn.style.display = 'none';
  o.root.classList.remove('show');
}
