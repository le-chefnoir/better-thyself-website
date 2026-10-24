/* Shared newest-first source for the home galleries and store carousel. */
(() => {
  'use strict';
  const config = window.BTYouTubeConfig;
  const cache = new Map();
  const pending = new Map();
  const fallbackFeeds = new Map();
  const refreshMs = 5 * 60 * 1000;

  async function request(playlistId, pageToken = '') {
    const url = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
    url.search = new URLSearchParams({ part: 'snippet,contentDetails,status', maxResults: '50', playlistId, key: config.apiKey });
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
      if (!response.ok) {
        const error = new Error(`YouTube returned HTTP ${response.status}.`);
        error.status = response.status;
        throw error;
      }
      return await response.json();
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function normalize(items = []) {
    const videos = new Map();
    for (const item of items) {
      const id = item.contentDetails?.videoId || item.snippet?.resourceId?.videoId;
      const title = item.snippet?.title;
      const publishedAt = item.contentDetails?.videoPublishedAt;
      if (!/^[\w-]{11}$/.test(id || '') || !title || !publishedAt) continue;
      if (['private', 'unlisted'].includes(item.status?.privacyStatus)) continue;
      if (['Private video', 'Deleted video'].includes(title)) continue;
      if (!Number.isFinite(Date.parse(publishedAt)) || Date.parse(publishedAt) > Date.now()) continue;
      videos.set(id, { id, title, publishedAt, thumbnail: `https://i.ytimg.com/vi/${id}/mqdefault.jpg` });
    }
    return [...videos.values()].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  }

  async function fallback(kind, offset = 0, force = false) {
    let saved = fallbackFeeds.get(kind);
    if (force || !saved || Date.now() - saved.time >= refreshMs) {
      let pageToken = '';
      let raw = [];
      let pages = 0;
      do {
        const data = await request(config.fallbackPlaylists[kind], pageToken);
        raw = raw.concat(data.items || []);
        pageToken = data.nextPageToken || '';
        pages += 1;
        // Custom playlists may be oldest-first: never treat their first page as newest.
        if (pageToken && pages >= 20) throw new Error('Fallback playlist exceeds the scan limit.');
      } while (pageToken);
      saved = { time: Date.now(), items: normalize(raw) };
      fallbackFeeds.set(kind, saved);
    }
    return { items: saved.items.slice(offset, offset + 50), nextPageToken: offset + 50 < saved.items.length ? `fallback:${offset + 50}` : null, source: 'fallback' };
  }

  async function load(kind, pageToken, force) {
    if (pageToken.startsWith('fallback:')) return fallback(kind, Number(pageToken.split(':')[1]), force);
    const channelSuffix = config.channelId.slice(2);
    // YouTube's channel-generated Videos/Shorts playlists were verified on this channel.
    // Their ID convention is undocumented; retain curated playlists as a fallback.
    const playlistId = `${kind === 'shorts' ? 'UUSH' : 'UULF'}${channelSuffix}`;
    try {
      const data = await request(playlistId, pageToken);
      return { items: normalize(data.items), nextPageToken: data.nextPageToken || null, source: 'channel' };
    } catch (error) {
      if (!pageToken && [400, 404].includes(error.status)) return fallback(kind, 0, force);
      throw error;
    }
  }

  async function getPage(kind, { pageToken = '', force = false } = {}) {
    if (!['videos', 'shorts'].includes(kind)) throw new Error('Unknown upload type.');
    const key = `${kind}:${pageToken}`;
    if (pending.has(key)) return pending.get(key);
    const saved = cache.get(key);
    if (!force && saved && Date.now() - saved.time < refreshMs) return saved.page;
    const promise = load(kind, pageToken, force).then(page => {
      cache.set(key, { time: Date.now(), page });
      // Bound metadata caching even during a long browsing session.
      if (cache.size > 30) cache.delete(cache.keys().next().value);
      return page;
    }).finally(() => pending.delete(key));
    pending.set(key, promise);
    return promise;
  }

  function watch(callback) {
    let timer;
    let lastChecked = Date.now();
    const schedule = () => {
      window.clearTimeout(timer);
      if (!document.hidden) timer = window.setTimeout(check, refreshMs);
    };
    const check = async () => {
      if (document.hidden) return;
      lastChecked = Date.now();
      try { await callback(); } catch { /* Keep the last successful content on transient failures. */ }
      schedule();
    };
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && Date.now() - lastChecked >= refreshMs) check();
      else schedule();
    });
    schedule();
    window.addEventListener('pagehide', () => window.clearTimeout(timer));
    window.addEventListener('pageshow', schedule);
  }
  window.BTYouTube = { getPage, watch };
})();
