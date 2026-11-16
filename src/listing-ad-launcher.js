// Intercept the legacy PDF action and open the new authenticated HTML listing.
const openListing = event => {
  const button = event.target.closest?.('[data-export-pdf]');
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  const id = button.dataset.exportPdf;
  if (id) window.open('/anuncio.html?id=' + encodeURIComponent(id), '_blank', 'noopener');
};
document.addEventListener('click', openListing, true);
const renameButtons = () => document.querySelectorAll('[data-export-pdf]').forEach(button => {
  if (button.textContent.trim() === 'Exportar PDF') button.textContent = 'Abrir anúncio';
});
renameButtons();
new MutationObserver(renameButtons).observe(document.body, { childList: true, subtree: true });
