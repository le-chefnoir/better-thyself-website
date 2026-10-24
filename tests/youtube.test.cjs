/* Run with Node's test runner and jsdom available in NODE_PATH. No real API calls. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const flush = async () => { for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve)); };
const id = n => String(n).padStart(11, 'v');
const video = (n, day = n, title = `Episode ${n}`) => ({ id: id(n), title, publishedAt: new Date(Date.UTC(2026, 6, day)).toISOString(), thumbnail: `https://i.ytimg.com/vi/${id(n)}/mqdefault.jpg` });
const raw = entry => ({ snippet: { title: entry.title, resourceId: { videoId: entry.id } }, contentDetails: { videoId: entry.id, videoPublishedAt: entry.publishedAt }, status: { privacyStatus: 'public' } });
function dom(file = 'index.html', reduced = false) {
  const instance = new JSDOM(read(file), { url: 'https://example.test/', runScripts: 'outside-only', pretendToBeVisual: true });
  instance.window.matchMedia = () => ({ matches: reduced, addEventListener() {} });
  instance.window.HTMLElement.prototype.animate = () => ({ cancel() {}, pause() {}, play() {}, onfinish: null });
  return instance;
}
function evaluate(instance, ...files) { files.forEach(file => instance.window.eval(read(file))); }
function setupGallery(instance, feeds) {
  let watch;
  const calls = [];
  instance.window.BTYouTube = {
    getPage: async (kind, options = {}) => { calls.push({ kind, ...options }); return feeds(kind, options); },
    watch: callback => { watch = callback; }
  };
  evaluate(instance, 'video-player.js', 'youtube-gallery.js');
  return { calls, refresh: () => watch() };
}

test('channel feeds are separate, newest-first, safe, cached and deduplicated', async () => {
  const instance = dom();
  const { window } = instance;
  window.BTYouTubeConfig = { apiKey: 'test-key', channelId: 'UCchannel', fallbackPlaylists: { videos: 'manual-videos', shorts: 'manual-shorts' } };
  const requested = [];
  window.fetch = async url => {
    requested.push(new URL(url).searchParams.get('playlistId'));
    const privateVideo = raw(video(3)); privateVideo.status.privacyStatus = 'private';
    return { ok: true, json: async () => ({ items: [raw(video(1)), raw(video(2)), raw(video(2)), privateVideo, raw({ ...video(4), publishedAt: '2099-01-01T00:00:00Z' })] }) };
  };
  evaluate(instance, 'youtube-feed.js');
  const [first, concurrent] = await Promise.all([window.BTYouTube.getPage('videos'), window.BTYouTube.getPage('videos')]);
  assert.deepEqual(Array.from(first.items, item => item.id), [id(2), id(1)]);
  assert.equal(first, concurrent);
  await window.BTYouTube.getPage('videos');
  await window.BTYouTube.getPage('shorts');
  assert.deepEqual(requested, ['UULFchannel', 'UUSHchannel']);
  instance.window.close();
});

test('custom-playlist fallback scans beyond page one before selecting the newest', async () => {
  const instance = dom();
  const { window } = instance;
  window.BTYouTubeConfig = { apiKey: 'test', channelId: 'UCchannel', fallbackPlaylists: { videos: 'manual', shorts: 'shorts' } };
  window.fetch = async url => {
    const query = new URL(url).searchParams;
    if (query.get('playlistId').startsWith('UULF')) return { ok: false, status: 404 };
    const next = query.get('pageToken');
    return { ok: true, json: async () => next ? { items: [raw(video(60, 60))] } : { items: Array.from({ length: 50 }, (_, i) => raw(video(i + 1))), nextPageToken: 'page-two' } };
  };
  evaluate(instance, 'youtube-feed.js');
  const page = await window.BTYouTube.getPage('videos');
  assert.equal(page.items[0].id, id(60));
  assert.equal(page.source, 'fallback');
  assert.equal(page.nextPageToken, 'fallback:50');
  assert.equal((await window.BTYouTube.getPage('videos', { pageToken: page.nextPageToken })).items.length, 1);
  instance.window.close();
});

test('an API restriction error stays visible to the caller without wasting fallback requests', async () => {
  const instance = dom();
  const { window } = instance;
  window.BTYouTubeConfig = { apiKey: 'test', channelId: 'UCchannel' };
  let count = 0;
  window.fetch = async () => { count++; return { ok: false, status: 403 }; };
  evaluate(instance, 'youtube-feed.js');
  await assert.rejects(window.BTYouTube.getPage('videos'), /HTTP 403/);
  assert.equal(count, 1);
  instance.window.close();
});

test('no iframe until Play, no player reset during Load More or a fresh upload', async () => {
  const instance = dom();
  const { window } = instance;
  let items = Array.from({ length: 12 }, (_, i) => video(20 - i));
  const app = setupGallery(instance, async () => ({ items, nextPageToken: null }));
  await flush();
  assert.equal(window.document.querySelectorAll('iframe').length, 0);
  assert.equal(window.document.querySelector('.youtube-player').dataset.videoId, id(20));
  assert.equal(window.document.querySelectorAll('#videos-grid .youtube-card').length, 8);
  window.document.querySelectorAll('#videos-grid .youtube-card')[2].click();
  const frame = window.document.querySelector('iframe');
  assert.match(frame.src, new RegExp(id(18)));
  window.document.getElementById('videos-load-more').click();
  await flush();
  assert.equal(window.document.querySelectorAll('#videos-grid .youtube-card').length, 12);
  assert.equal(window.document.querySelector('iframe'), frame);
  items = [video(21), ...items];
  await app.refresh();
  assert.equal(window.document.querySelector('#videos-grid .youtube-card').dataset.videoId, id(21));
  assert.equal(window.document.querySelector('iframe'), frame);
  assert.equal(window.document.querySelectorAll('iframe').length, 1);
  instance.window.close();
});

test('an untouched preview updates automatically; removed items disappear', async () => {
  const instance = dom();
  let items = [video(2), video(1)];
  const app = setupGallery(instance, async () => ({ items, nextPageToken: null }));
  await flush();
  items = [video(3), video(2)];
  await app.refresh();
  assert.equal(instance.window.document.querySelector('.youtube-player').dataset.videoId, id(3));
  assert.equal(instance.window.document.querySelector(`[data-video-id="${id(1)}"]`), null);
  instance.window.close();
});

test('slow background Videos response cannot overwrite a selected Shorts tab', async () => {
  const instance = dom();
  let resolveVideos;
  setupGallery(instance, kind => kind === 'videos' ? new Promise(resolve => { resolveVideos = resolve; }) : Promise.resolve({ items: [video(9)], nextPageToken: null }));
  instance.window.document.querySelector('[data-kind="shorts"]').click();
  await flush();
  resolveVideos({ items: [video(8)], nextPageToken: null });
  await flush();
  assert.equal(instance.window.document.querySelector('.youtube-player').dataset.videoId, id(9));
  assert.equal(instance.window.document.querySelector('[data-gallery-panel="shorts"]').hidden, false);
  instance.window.close();
});

test('titles are text, and a transient refresh failure preserves working content', async () => {
  const instance = dom();
  let fail = false;
  const app = setupGallery(instance, async () => {
    if (fail) throw new Error('network');
    return { items: [video(2, 2, '<img src=x onerror="alert(1)">')], nextPageToken: null };
  });
  await flush();
  const grid = instance.window.document.getElementById('videos-grid');
  assert.equal(grid.querySelectorAll('img').length, 1);
  assert.match(grid.textContent, /<img src=x/);
  fail = true;
  await app.refresh();
  assert.equal(grid.querySelectorAll('.youtube-card').length, 1);
  assert.match(instance.window.document.getElementById('uploads-status').textContent, /Unable to refresh/);
  instance.window.close();
});

test('carousel uses the newest full episode and refreshes without accumulating clones', async () => {
  const instance = dom('shop.html');
  const { window } = instance;
  Object.defineProperty(window.HTMLElement.prototype, 'offsetWidth', { get: () => 1800 });
  Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', { get: () => 1080 });
  let entry = video(2);
  let refresh;
  window.BTYouTube = { getPage: async kind => { assert.equal(kind, 'videos'); return { items: [entry] }; }, watch: callback => { refresh = callback; } };
  evaluate(instance, 'video-player.js', 'shop-interactions.js', 'site-motion.js');
  await flush();
  const track = window.document.querySelector('.carousel-track');
  const originalCount = track.children.length;
  assert.match(track.firstElementChild.querySelector('a').href, new RegExp(id(2)));
  assert.equal(window.document.querySelectorAll('iframe').length, 0);
  entry = video(3);
  await refresh();
  assert.match(track.firstElementChild.querySelector('a').href, new RegExp(id(3)));
  assert.equal(track.children.length, originalCount);
  window.document.querySelector('.carousel-motion-toggle').click();
  assert.equal(window.document.querySelector('.carousel').classList.contains('is-paused'), true);
  instance.window.close();
});

test('reduced-motion mode adds no reveal hiding or carousel clones', async () => {
  const instance = dom('shop.html', true);
  instance.window.BTYouTube = { getPage: async () => ({ items: [video(2)] }), watch() {} };
  Object.defineProperty(instance.window.HTMLElement.prototype, 'offsetWidth', { get: () => 1800 });
  evaluate(instance, 'shop-interactions.js', 'site-motion.js');
  await flush();
  assert.equal(instance.window.document.querySelectorAll('.motion-pending, .is-clone').length, 0);
  assert.equal(instance.window.document.querySelector('.carousel-motion-toggle').hidden, true);
  instance.window.close();
});

test('refresh preserves the next unread pagination cursor', async () => {
  const instance = dom();
  let fresh = false;
  const app = setupGallery(instance, async (kind, options) => {
    if (options.pageToken === 'page-two') return { items: Array.from({ length: 8 }, (_, i) => video(12 - i)), nextPageToken: 'page-three' };
    if (options.pageToken === 'page-three') return { items: [video(4)], nextPageToken: null };
    return { items: Array.from({ length: 8 }, (_, i) => video((fresh ? 21 : 20) - i)), nextPageToken: 'page-two' };
  });
  await flush();
  const more = instance.window.document.getElementById('videos-load-more');
  more.click(); await flush();
  fresh = true;
  await app.refresh();
  more.click(); await flush();
  more.click(); await flush();
  assert.deepEqual(app.calls.filter(call => call.pageToken).map(call => call.pageToken), ['page-two', 'page-three']);
  instance.window.close();
});

test('automatic polling stops in a hidden tab and refreshes when it becomes visible', async () => {
  const instance = dom();
  const { window } = instance;
  let clock = 100;
  let hidden = false;
  let checks = 0;
  let sequence = 0;
  const timers = new Map();
  Object.defineProperty(window.document, 'hidden', { get: () => hidden });
  window.Date.now = () => clock;
  window.setTimeout = (callback, delay) => { timers.set(++sequence, { callback, delay }); return sequence; };
  window.clearTimeout = handle => timers.delete(handle);
  window.BTYouTubeConfig = { channelId: 'UCtest' };
  evaluate(instance, 'youtube-feed.js');
  window.BTYouTube.watch(async () => { checks++; });
  await flush();
  assert.equal(timers.size, 1);
  hidden = true;
  window.document.dispatchEvent(new window.Event('visibilitychange'));
  assert.equal(timers.size, 0);
  clock += 600000;
  hidden = false;
  window.document.dispatchEvent(new window.Event('visibilitychange'));
  await flush();
  assert.equal(checks, 1);
  assert.equal(timers.size, 1);
  instance.window.close();
});
