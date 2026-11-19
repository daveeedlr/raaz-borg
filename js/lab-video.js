(() => {
  let active;

  function closePlayer() {
    if (!active) return;
    active.panel.remove();
    active.link.hidden = false;
    active = null;
  }

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
      closePlayer();
      const panel = document.createElement('div');
      panel.className = 'lab-player';
      const frame = document.createElement('iframe');
      const title = link.querySelector('h3') || document.getElementById(link.getAttribute('aria-labelledby'));
      frame.title = title.textContent.trim();
      frame.src = embed.href;
      frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      frame.referrerPolicy = 'strict-origin-when-cross-origin';

      const actions = document.createElement('div');
      actions.className = 'lab-player-actions';
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'text-link';
      const fallback = document.createElement('a');
      fallback.className = 'text-link';
      fallback.href = watch.href;
      fallback.target = '_blank';
      fallback.rel = 'noopener';
      actions.append(close, fallback);
      panel.append(frame, actions);

      const translate = () => {
        const english = document.documentElement.lang === 'en';
        close.textContent = english ? 'Close player' : 'Cerrar reproductor';
        fallback.textContent = english ? 'Open on YouTube' : 'Abrir en YouTube';
      };
      close.addEventListener('click', () => {
        closePlayer();
        link.focus();
      });
      active = { link, panel, translate };
      translate();
      link.hidden = true;
      link.after(panel);
      frame.focus();
    });
  }
  document.addEventListener('languagechange', () => active?.translate());
})();
