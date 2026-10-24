/* Load the third-party player only after an explicit Play action. */
(() => {
  'use strict';
  function show(box, video, { play = false } = {}) {
    if (!box || !/^[\w-]{11}$/.test(video.id || '')) return;
    if (box.dataset.videoId === video.id && box.querySelector('iframe')) return;
    box.dataset.videoId = video.id;
    box.dataset.playing = String(play);
    if (play) {
      const frame = document.createElement('iframe');
      frame.src = `https://www.youtube-nocookie.com/embed/${video.id}?rel=0&autoplay=1`;
      frame.title = video.title || 'Better Thyself video';
      frame.allow = 'autoplay; encrypted-media; picture-in-picture; web-share';
      frame.referrerPolicy = 'strict-origin-when-cross-origin';
      frame.allowFullscreen = true;
      box.replaceChildren(frame);
      frame.focus();
      return;
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'video-preview';
    button.setAttribute('aria-label', `Play ${video.title || 'Better Thyself video'}`);
    const image = document.createElement('img');
    image.src = `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`;
    image.alt = '';
    image.width = 480;
    image.height = 360;
    image.loading = 'lazy';
    image.decoding = 'async';
    const title = document.createElement('span');
    title.className = 'video-preview-title';
    title.textContent = video.title;
    const icon = document.createElement('span');
    icon.className = 'video-play-icon';
    icon.textContent = '▶';
    icon.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.className = 'video-preview-label';
    label.textContent = 'Play on this page';
    button.append(image, title, icon, label);
    button.addEventListener('click', () => show(box, video, { play: true }));
    box.replaceChildren(button);
  }
  window.BTMedia = { show };
  document.querySelectorAll('.video-frame[data-video-id]').forEach(box => {
    show(box, { id: box.dataset.videoId, title: box.dataset.title || 'Better Thyself video' });
  });
})();
