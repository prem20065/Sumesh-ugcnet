export const $ = (id: string) => document.getElementById(id) as any;

type Props = Record<string, any> | null | undefined;

/** Small element builder: `class`, `text`, `onclick`-style handlers, and boolean attributes. */
export function el(tag: string, props?: Props, ...children: any[]): HTMLElement {
  const e = document.createElement(tag);
  if (props)
    for (const k in props) {
      const v = props[k];
      if (k === "class") e.className = v;
      else if (k === "text") e.textContent = v;
      else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), v);
      else if (v === true) e.setAttribute(k, "");
      else if (v !== false && v != null) e.setAttribute(k, v);
    }
  for (const c of children) if (c != null) e.append(c);
  return e;
}

/** Grow a textarea to fit its content. */
export function fit(t: HTMLTextAreaElement) {
  t.style.height = "auto";
  t.style.height = Math.max(t.scrollHeight + 2, 40) + "px";
}
