// Construction du DOM sans innerHTML : tout texte passe par textContent (pas d'injection possible).

export type Child = Node | string | number | null | undefined | false;

type Listeners = { [E in keyof HTMLElementEventMap]?: (event: HTMLElementEventMap[E]) => void };

export interface Props {
  class?: string;
  title?: string;
  type?: string;
  value?: string;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
  autocomplete?: AutoFill;
  attrs?: Record<string, string>;
  style?: Record<string, string>;
  on?: Listeners;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props | null = null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (props) applyProps(element, props);
  append(element, ...children);
  return element;
}

export function append(parent: Node, ...children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/** Vide un élément puis y ajoute les enfants. */
export function replaceChildren(parent: Element, ...children: Child[]): void {
  parent.replaceChildren();
  append(parent, ...children);
}

function applyProps(element: HTMLElement, props: Props): void {
  const { class: className, attrs, style, on, ...rest } = props;
  if (className) element.className = className;
  for (const [name, value] of Object.entries(attrs ?? {})) element.setAttribute(name, value);
  for (const [name, value] of Object.entries(style ?? {})) element.style.setProperty(name, value);
  for (const [name, value] of Object.entries(rest)) {
    if (value !== undefined) Reflect.set(element, name, value);
  }
  for (const [type, listener] of Object.entries(on ?? {})) {
    element.addEventListener(type, listener as EventListener);
  }
}
