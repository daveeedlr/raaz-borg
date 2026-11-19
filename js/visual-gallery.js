(() => {
  const dialog = document.querySelector('.visual-gallery');
  const tiles = [...document.querySelectorAll('#mundo-visual .m-item')];
  const preview = dialog.querySelector('.visual-gallery-image');
  const caption = dialog.querySelector('figcaption');
  let index = 0;
  let trigger;

  function showImage(position) {
    index = (position + tiles.length) % tiles.length;
    const source = tiles[index].querySelector('img');
    preview.src = source.currentSrc || source.src;
    preview.alt = source.alt;
    caption.textContent = tiles[index].querySelector('.cap').textContent.trim() + ' · ' + (index + 1) + ' / ' + tiles.length;
  }

  tiles.forEach((tile, position) => {
    tile.addEventListener('click', () => {
      trigger = tile;
      showImage(position);
      dialog.showModal();
    });
  });

  dialog.querySelectorAll('[data-gallery-step]').forEach(button => {
    button.addEventListener('click', () => showImage(index + Number(button.dataset.galleryStep)));
  });
  dialog.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      showImage(index + (event.key === 'ArrowRight' ? 1 : -1));
    }
  });
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => trigger?.focus());
  document.addEventListener('languagechange', () => {
    if (dialog.open) showImage(index);
  });
})();
