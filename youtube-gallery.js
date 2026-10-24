(() => {
  'use strict';
  const player = document.querySelector('.youtube-player');
  if (!player) return;
  const status = document.querySelector('#uploads-status');
  const tabs = [...document.querySelectorAll('.upload-toggle-button')];
  const states = Object.fromEntries(['videos', 'shorts'].map(kind => [kind, {
    items: [], visible: 8, nextPageToken: null, selectedId: null, manual: false, busy: false, initialized: false, extraPagesLoaded: false,
    grid: document.getElementById(`${kind}-grid`), button: document.getElementById(`${kind}-load-more`)
  }]));
  let currentKind = 'videos';
  function updateButton(kind) {
    const state = states[kind];
    state.button.hidden = !state.nextPageToken && state.visible >= state.items.length;
    state.button.disabled = state.busy;
    state.button.classList.toggle('is-loading', state.busy);
    state.button.setAttribute('aria-busy', String(state.busy));
  }
  function choose(kind, video, play = false) {
    const state = states[kind];
    state.selectedId = video.id;
    if (currentKind !== kind) return;
    window.BTMedia.show(player, video, { play });
    state.grid.querySelectorAll('.youtube-card').forEach(card => {
      const active = card.dataset.videoId === video.id;
      card.classList.toggle('is-active', active);
      card.setAttribute('aria-pressed', String(active));
    });
  }
  function render(kind) {
    const state = states[kind];
    // Append/reorder existing cards, preserving keyboard focus on refresh and Load More.
    const existing = new Map([...state.grid.querySelectorAll('.youtube-card')].map(card => [card.dataset.videoId, card]));
    state.grid.querySelectorAll('.youtube-empty').forEach(node => node.remove());
    const shown = state.items.slice(0, state.visible);
    for (const video of shown) {
      let card = existing.get(video.id);
      if (!card) {
        card = document.createElement('button');
        card.type = 'button';
        card.className = 'youtube-card';
        card.dataset.videoId = video.id;
        card.title = video.title;
        const image = document.createElement('img');
        image.src = video.thumbnail;
        image.alt = '';
        image.width = 320;
        image.height = 180;
        image.loading = 'lazy';
        image.decoding = 'async';
        const content = document.createElement('div');
        content.className = 'youtube-card-content';
        const title = document.createElement('span');
        title.textContent = video.title;
        content.append(title);
        card.append(image, content);
        card.addEventListener('click', () => {
          state.manual = true;
          choose(kind, state.items.find(item => item.id === card.dataset.videoId), true);
        });
      }
      card.title = video.title;
      card.querySelector('.youtube-card-content span').textContent = video.title;
      const active = state.selectedId === video.id;
      card.classList.toggle('is-active', active);
      card.setAttribute('aria-pressed', String(active));
      // Moving only out-of-order nodes avoids dropping focus on an unchanged card.
      const index = shown.indexOf(video);
      if (state.grid.children[index] !== card) state.grid.insertBefore(card, state.grid.children[index] || null);
      existing.delete(video.id);
    }
    existing.forEach(card => card.remove());
    if (!shown.length) {
      const message = document.createElement('p');
      message.className = 'youtube-empty';
      message.textContent = `No ${kind} available yet.`;
      state.grid.append(message);
    }
    updateButton(kind);
  }
  async function refresh(kind, force = false) {
    const state = states[kind];
    if (state.busy) return;
    state.busy = true;
    state.grid.setAttribute('aria-busy', 'true');
    updateButton(kind);
    try {
      const page = await window.BTYouTube.getPage(kind, { force });
      const oldLatest = state.items[0]?.id;
      const boundary = Date.parse(page.items.at(-1)?.publishedAt || '1970-01-01');
      const older = page.nextPageToken ? state.items.filter(video => Date.parse(video.publishedAt) < boundary) : [];
      const merged = new Map([...older, ...page.items].map(video => [video.id, video]));
      state.items = [...merged.values()].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
      if (!page.nextPageToken || !state.initialized || !state.extraPagesLoaded) state.nextPageToken = page.nextPageToken;
      state.initialized = true;
      const playing = currentKind === kind && player.dataset.playing === 'true';
      const selected = state.items.find(video => video.id === state.selectedId);
      if (currentKind === kind && state.items.length && !playing && !state.manual) choose(kind, state.items[0]);
      else if (!selected) state.selectedId = state.items[0]?.id || null;
      render(kind);
      if (currentKind === kind) {
        status.textContent = oldLatest && oldLatest !== state.items[0]?.id
          ? (playing || state.manual ? 'New upload added. Your selected video is unchanged.' : 'Updated to the newest upload.')
          : 'Newest uploads first · checks for updates every 5 minutes.';
      }
    } catch {
      if (currentKind === kind) {
        status.textContent = `Unable to refresh ${kind}. Your loaded videos are kept. Try the ${kind === 'videos' ? 'Videos' : 'Shorts'} button again, or watch on YouTube.`;
        if (!state.items.length && !player.querySelector('iframe')) {
          const message = document.createElement('p');
          message.className = 'youtube-empty';
          message.textContent = 'Episodes are temporarily unavailable. Use the YouTube link below to watch.';
          player.replaceChildren(message);
        }
      }
    } finally {
      state.busy = false;
      state.grid.setAttribute('aria-busy', 'false');
      updateButton(kind);
    }
  }
  async function more(kind) {
    const state = states[kind];
    if (state.busy) return;
    state.busy = true;
    updateButton(kind);
    try {
      if (state.visible >= state.items.length && state.nextPageToken) {
        const page = await window.BTYouTube.getPage(kind, { pageToken: state.nextPageToken });
        state.items = [...new Map([...state.items, ...page.items].map(video => [video.id, video])).values()];
        state.nextPageToken = page.nextPageToken;
        state.extraPagesLoaded = true;
      }
      state.visible += 8;
      render(kind);
    } catch {
      status.textContent = 'Unable to load more right now. Your selected video is unchanged; try again.';
    } finally {
      state.busy = false;
      updateButton(kind);
    }
  }
  tabs.forEach(tab => tab.addEventListener('click', async () => {
    currentKind = tab.dataset.kind;
    tabs.forEach(button => {
      const active = button === tab;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    document.querySelector('.upload-toggle').dataset.selection = currentKind;
    document.querySelectorAll('[data-gallery-panel]').forEach(panel => {
      const active = panel.dataset.galleryPanel === currentKind;
      panel.hidden = !active;
      panel.classList.toggle('is-active', active);
    });
    const kind = currentKind;
    const state = states[kind];
    const video = state.items.find(item => item.id === state.selectedId) || state.items[0];
    if (video) choose(kind, video);
    else { player.replaceChildren(); player.dataset.playing = 'false'; status.textContent = `Loading newest ${kind}…`; }
    await refresh(kind);
    // A cached inactive feed may have finished while another tab was visible.
    if (currentKind === kind && !player.children.length && state.items.length) choose(kind, state.items[0]);
  }));
  Object.entries(states).forEach(([kind, state]) => state.button.addEventListener('click', () => more(kind)));
  status.textContent = 'Loading newest episodes…';
  refresh('videos');
  window.BTYouTube.watch(() => Promise.all(Object.keys(states).filter(kind => states[kind].initialized).map(kind => refresh(kind, true))));
})();
