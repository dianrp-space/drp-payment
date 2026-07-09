(function () {
  try {
    var stored = localStorage.getItem("drp-theme");
    var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    var isDark = stored ? stored === "dark" : prefersDark;
    document.documentElement.setAttribute("data-theme", isDark ? "drp-dark" : "drp");
    if (isDark) document.documentElement.classList.add("dark");
  } catch (e) {}
})();
