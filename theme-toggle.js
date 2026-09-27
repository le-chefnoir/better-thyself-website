(() => {
  const root = document.documentElement;
  const storageKey = "better-thyself-theme";
  const defaultTheme = root.dataset.theme === "light" ? "light" : "dark";
  let savedTheme;

  try {
    savedTheme = localStorage.getItem(storageKey);
  } catch {
    savedTheme = null;
  }

  root.dataset.theme = savedTheme === "light" || savedTheme === "dark"
    ? savedTheme
    : defaultTheme;

  document.addEventListener("DOMContentLoaded", () => {
    const button = document.querySelector(".theme-toggle");
    if (!button) return;

    let animationTimer;

    const setTheme = (theme, animate = false) => {
      const changed = root.dataset.theme !== theme;
      root.dataset.theme = theme;
      button.setAttribute("aria-pressed", String(theme === "light"));
      button.title = `Switch to ${theme === "light" ? "night" : "day"} mode`;

      try {
        localStorage.setItem(storageKey, theme);
      } catch {
        // Theme changes still work for this page when storage is unavailable.
      }

      if (!changed || !animate) return;
      button.classList.remove("is-animating");
      void button.offsetWidth;
      button.classList.add("is-animating");
      window.clearTimeout(animationTimer);
      animationTimer = window.setTimeout(() => button.classList.remove("is-animating"), 1050);
    };

    button.addEventListener("click", () => {
      const nextTheme = root.dataset.theme === "light" ? "dark" : "light";
      setTheme(nextTheme, true);
    });

    setTheme(root.dataset.theme);
  });
})();
