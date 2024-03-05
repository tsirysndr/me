/** @jsx h */
import { h } from "../deps.ts";

export function header() {
  return (
    <div>
      <h2 style="font-weight: 500;margin-bottom: 0">Hello, I'm</h2>
      <h1 style="font-size: 2rem; font-weight: 600; margin-top: 0">
        Tsiry Sandratraina
        <b class="blinking_cursor">_</b>
      </h1>
    </div>
  );
}
