(() => {
  const dialog = document.querySelector('.lab-player');
  const frame = dialog.querySelector('iframe');
  const heading = dialog.querySelector('h2');
  const fallback = dialog.querySelector('.lab-player-fallback');
  let trigger;

  for (const link of document.querySelectorAll('.lab-play')) {
    link.addEventListener('click', event => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;

      const watch = new URL(link.href);
      const id = watch.searchParams.get('v');
      if (!id) return;
      const embed = new URL('/embed/' + id, 'https://www.youtube-nocookie.com');
      const playlist = watch.searchParams.get('list');
      const start = parseInt(watch.searchParams.get('t'), 10);
      if (playlist) embed.searchParams.set('list', playlist);
      if (start > 0) embed.searchParams.set('start', start);
      embed.searchParams.set('autoplay', '1');

      event.preventDefault();
      trigger = link;
      const title = link.querySelector('h3') || document.getElementById(link.getAttribute('aria-labelledby'));
      heading.textContent = title.textContent.trim();
      frame.title = heading.textContent;
      frame.src = embed.href;
      fallback.href = watch.href;
      dialog.showModal();
    });
  }

  dialog.querySelector('.lab-player-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => {
    frame.removeAttribute('src');
    trigger?.focus({ preventScroll: true });
  });
})();
