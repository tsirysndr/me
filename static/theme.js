try {
  document.documentElement.dataset.theme =
    localStorage.getItem("theme") === "light" ? "light" : "dark";
} catch {
  // Keep the default dark theme if browser storage is unavailable.
}
