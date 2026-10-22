// The only two links you need to edit once GitHub and Discord are set up.
const KESTREL_LINKS = {
  // Always points at the newest release's installer.
  download: "https://github.com/viaturtles/kestrelclient/releases/latest",
  discord: "https://discord.gg/8pVEuMc6NZ",
};

document.querySelectorAll("[data-link]").forEach((a) => {
  const url = KESTREL_LINKS[a.dataset.link];
  if (url) a.href = url;
});
document.querySelectorAll("[data-year]").forEach((el) => (el.textContent = new Date().getFullYear()));
