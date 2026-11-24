import type { ComponentChildren } from "preact";

export function AsciiFrame(
  props: { children: ComponentChildren; class?: string },
) {
  return (
    <div class={`dashed-box ${props.class ?? ""}`}>
      {props.children}
    </div>
  );
}
