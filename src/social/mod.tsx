/** @jsx h  */
import { h } from "../../deps.ts";
import { twitter } from "../twitter.tsx";
import { bluesky } from "./bluesky.tsx";
import { github } from "./github.tsx";
import { linkedin } from "./linkedin.tsx";

export function social() {
  return (
    <div style="display: flex; flex-direction: row; justify-content: space-around; width: 100px;">
      {github()}
      {bluesky()}
      {twitter()}
      {linkedin()}
    </div>
  );
}
