try {
  document.documentElement.dataset.theme =
    localStorage.getItem("theme") === "dark" ? "dark" : "light";
} catch {
  // Keep the default light theme if browser storage is unavailable.
}
