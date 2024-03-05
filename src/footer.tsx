/** @jsx h */
import { dayjs, h } from "../deps.ts";
import { social } from "./social/mod.tsx";

export function footer() {
  return (
    <div style="display: flex; flex-direction: row; justify-content: space-between;">
      <div style="color: rgb(109, 109, 156); font-size: 17px;">
        © {dayjs().format("YYYY")} Tsiry Sandratraina.
      </div>
      {social()}
    </div>
  );
}
