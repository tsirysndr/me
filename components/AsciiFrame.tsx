import type { ComponentChildren } from "preact";

export function AsciiFrame(
  props: { children: ComponentChildren; class?: string },
) {
  return (
    <div class={`ascii-frame ${props.class ?? ""}`}>
      <span class="ascii-corners ascii-top" aria-hidden="true">
        <span>+</span>
        <span>+</span>
      </span>
      {props.children}
      <span class="ascii-corners ascii-bottom" aria-hidden="true">
        <span>+</span>
        <span>+</span>
      </span>
    </div>
  );
}
