(() => {
  'use strict';
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const targets = [...document.querySelectorAll('.header-text, .btpfp, .hero, #recent-uploads > h2, .youtube-player, #products > h2, .product-wrapper, .newsletter-intro, .newsletter-box, .about-copy, .johnwickpfp, .shelf-card, .detail, .proof, .faq-item')];
  if (!preference.matches && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.remove('motion-pending');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0, rootMargin: '0px 0px -30px 0px' });
    targets.forEach((target, index) => {
      target.style.setProperty('--reveal-delay', `${(index % 3) * 65}ms`);
      target.classList.add('motion-item', 'motion-pending');
      observer.observe(target);
    });
    preference.addEventListener('change', event => {
      if (event.matches) { observer.disconnect(); targets.forEach(target => target.classList.remove('motion-pending')); }
    });
  }
  const carousel = document.querySelector('.carousel');
  if (!carousel) return;
  const toggle = document.querySelector('.carousel-motion-toggle');
  let inView = true;
  let userPaused = false;
  const sync = () => {
    const paused = userPaused || !inView || document.hidden || preference.matches;
    carousel.classList.toggle('is-paused', paused);
    carousel.dispatchEvent(new CustomEvent('motionchange', { detail: { paused } }));
    if (toggle) { toggle.textContent = userPaused ? 'Resume carousel' : 'Pause carousel'; toggle.setAttribute('aria-pressed', String(userPaused)); toggle.hidden = preference.matches; }
  };
  toggle?.addEventListener('click', () => { userPaused = !userPaused; sync(); });
  document.addEventListener('visibilitychange', sync);
  preference.addEventListener('change', sync);
  if ('IntersectionObserver' in window) new IntersectionObserver(entries => { inView = entries[0].isIntersecting; sync(); }).observe(carousel);
  sync();
})();
