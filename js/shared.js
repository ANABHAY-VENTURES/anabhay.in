// Shared progressive enhancement; navigation is present in every static page.
(() => {
  const toggle = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.site-nav');
  if (!toggle || !nav) return;
  document.documentElement.classList.add('menu-enhanced');
  toggle.hidden = false;
  const mobile = matchMedia('(max-width: 1000px)');
  function setOpen(open) {
    toggle.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('is-open', open);
    nav.inert = mobile.matches && !open;
  }
  toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      setOpen(false); toggle.focus();
    }
  });
  nav.addEventListener('click', event => { if (event.target.closest('a')) setOpen(false); });
  mobile.addEventListener('change', () => setOpen(false));
  setOpen(false);
})();
