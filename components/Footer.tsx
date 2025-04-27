import dayjs from "dayjs";

export function Footer() {
  return (
    <div class="flex flex-row justify-between mb-[20px] mt-[100px]">
      <div class="text-[rgb(109,109,156)] text-[17px]">
        © {dayjs().format("YYYY")} Tsiry Sandratraina.
      </div>
      <div class="flex flex-row justify-around w-[100px]">
        <a href="https://github.com/tsirysndr" target="_blank" class="social">
          <svg
            viewBox="0 0 16 16"
            height="20"
            width="20"
            aria-hidden="true"
            focusable="false"
            fill="rgb(109, 109, 156)"
            xmlns="http://www.w3.org/2000/svg"
            class="StyledIconBase-sc-ea9ulj-0 hFaFXW"
          >
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0 0 16 8c0-4.42-3.58-8-8-8z">
            </path>
          </svg>
        </a>
        <a
          href="https://bsky.app/profile/tsiry-sandratraina.com"
          target="_blank"
          class="social"
        >
          <svg fill="none" viewBox="0 0 64 57" width="21" height="21">
            <path
              fill="rgb(109, 109, 156)"
              d="M13.873 3.805C21.21 9.332 29.103 20.537 32 26.55v15.882c0-.338-.13.044-.41.867-1.512 4.456-7.418 21.847-20.923 7.944-7.111-7.32-3.819-14.64 9.125-16.85-7.405 1.264-15.73-.825-18.014-9.015C1.12 23.022 0 8.51 0 6.55 0-3.268 8.579-.182 13.873 3.805ZM50.127 3.805C42.79 9.332 34.897 20.537 32 26.55v15.882c0-.338.13.044.41.867 1.512 4.456 7.418 21.847 20.923 7.944 7.111-7.32 3.819-14.64-9.125-16.85 7.405 1.264 15.73-.825 18.014-9.015C62.88 23.022 64 8.51 64 6.55c0-9.818-8.578-6.732-13.873-2.745Z"
            >
            </path>
          </svg>
        </a>
        <a href="https://twitter.com/tsiry_sndr" target="_blank" class="social">
          <svg
            viewBox="0 0 16 16"
            height="21"
            width="21"
            aria-hidden="true"
            focusable="false"
            fill="rgb(109, 109, 156)"
            xmlns="http://www.w3.org/2000/svg"
            class="StyledIconBase-sc-ea9ulj-0 hFaFXW"
          >
            <path d="M5.026 15c6.038 0 9.341-5.003 9.341-9.334 0-.14 0-.282-.006-.422A6.685 6.685 0 0 0 16 3.542a6.658 6.658 0 0 1-1.889.518 3.301 3.301 0 0 0 1.447-1.817 6.533 6.533 0 0 1-2.087.793A3.286 3.286 0 0 0 7.875 6.03a9.325 9.325 0 0 1-6.767-3.429 3.289 3.289 0 0 0 1.018 4.382A3.323 3.323 0 0 1 .64 6.575v.045a3.288 3.288 0 0 0 2.632 3.218 3.203 3.203 0 0 1-.865.115 3.23 3.23 0 0 1-.614-.057 3.283 3.283 0 0 0 3.067 2.277A6.588 6.588 0 0 1 .78 13.58a6.32 6.32 0 0 1-.78-.045A9.344 9.344 0 0 0 5.026 15z">
            </path>
          </svg>
        </a>
        <a
          href="https://www.linkedin.com/in/tsiry-sandratraina"
          class="social"
          target="_blank"
        >
          <svg
            viewBox="0 0 448 512"
            height="20"
            width="20"
            focusable="false"
            role="img"
            fill="rgb(109, 109, 156)"
            xmlns="http://www.w3.org/2000/svg"
            class="StyledIconBase-sc-ea9ulj-0 hRnJPC"
          >
            <title>LinkedinIn icon</title>
            <path
              fill="rgb(109, 109, 156)"
              d="M100.3 448H7.4V148.9h92.88zM53.79 108.1C24.09 108.1 0 83.5 0 53.8a53.79 53.79 0 0 1 107.6 0c0 29.7-24.1 54.3-53.79 54.3zM447.9 448h-92.68V302.4c0-34.7-.7-79.2-48.29-79.2-48.29 0-55.69 37.7-55.69 76.7V448h-92.78V148.9h89.08v40.8h1.3c12.4-23.5 42.69-48.3 87.88-48.3 94 0 111.3 61.9 111.3 142.3V448z"
            >
            </path>
          </svg>
        </a>
      </div>
    </div>
  );
}
