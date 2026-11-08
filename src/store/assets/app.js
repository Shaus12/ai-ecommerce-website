/**
 * Shared shell for every store page: header, footer, cart drawer,
 * toast and scroll reveals. The cart lives in localStorage for now;
 * checkout will hand it to the payment page once that is connected.
 */

import { byId, collectionOf, money } from './products.js';
import { packshot } from './art.js';

const CART_KEY = 'soki-cart';
export const FREE_SHIPPING = 50;

export const icons = {
  bag: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 8h14l-1 13H6L5 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
  left: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M19 12H5m6-6-6 6 6 6"/></svg>',
  right: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>',
  chevron: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="m9 6 6 6-6 6"/></svg>',
  menu: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 8h16M4 16h16"/></svg>',
};

/* ---------- cart ---------- */

function load() {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) ?? []; } catch { return []; }
}
function save(items) {
  try { localStorage.setItem(CART_KEY, JSON.stringify(items)); } catch { /* storage blocked: cart lives for this page only */ }
}

let cart = load().filter(l => byId(l.id));

export const cartLines = () => cart.map(l => ({ ...l, product: byId(l.id) }));
export const cartCount = () => cart.reduce((n, l) => n + l.qty, 0);
export const cartTotal = () => cartLines().reduce((s, l) => s + l.qty * l.product.price, 0);

export function addToCart(id, qty = 1) {
  const line = cart.find(l => l.id === id);
  if (line) line.qty = Math.min(line.qty + qty, 10);
  else cart.push({ id, qty: Math.min(qty, 10) });
  commit();
  toast(`${byId(id).name} added to your bag`);
  document.querySelector('.bag-count')?.classList.add('bump');
}

function setQty(id, qty) {
  cart = qty <= 0 ? cart.filter(l => l.id !== id) : cart.map(l => (l.id === id ? { ...l, qty: Math.min(qty, 10) } : l));
  commit();
}

export function clearCart() { cart = []; commit(); }

function commit() {
  save(cart);
  renderCart();
  document.dispatchEvent(new CustomEvent('cart:change'));
}

/* ---------- shell ---------- */

function header(active) {
  const link = (href, label, key) => `<a href="${href}" class="${active === key ? 'active' : ''}">${label}</a>`;
  return `<div class="announce">Free US shipping over ${money(FREE_SHIPPING)} · Authentic Korean skincare</div>
  <header class="site-header">
    <div style="display:flex;align-items:center">
      <button class="menu-btn" aria-label="Menu" aria-expanded="false">${icons.menu}</button>
      <a class="logo" href="index.html">SO<span>.</span>KI</a>
    </div>
    <nav class="nav">
      ${link('index.html#shop', 'Shop', 'shop')}
      ${link('index.html#rituals', 'Rituals', 'rituals')}
      ${link('index.html#story', 'Our Story', 'story')}
      ${link('index.html#journal', 'Journal', 'journal')}
    </nav>
    <div class="header-tools">
      <a class="account" href="#">Sign in</a>
      <button class="bag-btn" data-open-cart>Bag <span class="bag-count">0</span></button>
    </div>
  </header>`;
}

function footer() {
  return `<footer class="site-footer" id="journal">
    <div><h4>EXPLORE</h4><ul>
      <li><a href="index.html#shop">Shop</a></li><li><a href="index.html#rituals">Rituals</a></li>
      <li><a href="index.html#story">Our Story</a></li><li><a href="#">Journal</a></li><li><a href="#">Sign Up / Login</a></li></ul></div>
    <div><h4>FOLLOW US</h4><ul><li><a href="#">Instagram</a></li><li><a href="#">TikTok</a></li><li><a href="#">Pinterest</a></li></ul></div>
    <div><h4>HELP</h4><ul><li><a href="#">Shipping &amp; Returns</a></li><li><a href="#">FAQ</a></li><li><a href="mailto:hello@soki.example">hello@soki.example</a></li></ul></div>
    <div class="newsletter">
      <h3>Hear more<br>from us</h3>
      <p>Get routine tips, new arrivals from Seoul and members-only offers.</p>
      <form data-newsletter><input type="email" required placeholder="Your email" aria-label="Email"><button class="pill-btn" type="submit">Subscribe</button></form>
      <small>No spam, only skin-first notes. Opt out anytime.</small>
    </div>
    <div class="wordmark" aria-hidden="true">SO.KI</div>
    <div class="footer-base"><span>Soft, Korean, Kind skincare. Honest products that truly work.</span><span>© ${new Date().getFullYear()} SO.KI, All Rights Reserved</span><span><a href="#">Privacy</a> · <a href="#">Terms</a></span></div>
  </footer>`;
}

function drawer() {
  return `<div class="scrim" data-close-cart></div>
  <aside class="drawer" aria-label="Shopping bag" aria-hidden="true">
    <div class="drawer-head"><h3 class="serif">Your bag</h3><button class="eyebrow" data-close-cart>Close</button></div>
    <div class="ship-bar"></div>
    <div class="drawer-items"></div>
    <div class="drawer-foot"></div>
  </aside>
  <div class="toast" role="status" aria-live="polite"></div>`;
}

function renderCart() {
  const count = cartCount();
  document.querySelectorAll('.bag-count').forEach(el => { el.textContent = count; });
  const items = document.querySelector('.drawer-items');
  if (!items) return;

  const total = cartTotal();
  const left = Math.max(0, FREE_SHIPPING - total);
  document.querySelector('.ship-bar').innerHTML = `${left > 0 ? `You're ${money(left)} away from free shipping` : 'You’ve unlocked free US shipping'}
    <div class="bar"><i style="width:${Math.min(100, (total / FREE_SHIPPING) * 100)}%"></i></div>`;

  if (!count) {
    items.innerHTML = `<div class="drawer-empty"><span class="serif">Nothing here yet</span>Your ritual starts with one step.</div>`;
    document.querySelector('.drawer-foot').innerHTML = `<a class="pill-btn" href="index.html#shop" data-close-cart>Shop the lineup</a>`;
    return;
  }

  items.innerHTML = cartLines().map(({ id, qty, product: p }) => `
    <div class="line" style="--tint:${collectionOf(p).tint}">
      <a class="thumb" href="product.html?id=${id}">${packshot(p)}</a>
      <div class="t">${p.name}<small>${p.size}</small>
        <div class="qty"><button data-qty="${id}" data-d="-1" aria-label="Less">−</button><span>${qty}</span><button data-qty="${id}" data-d="1" aria-label="More">+</button></div>
      </div>
      <div class="r">${money(qty * p.price)}<button data-remove="${id}">Remove</button></div>
    </div>`).join('');

  document.querySelector('.drawer-foot').innerHTML = `
    <div class="sum"><span>Subtotal</span><strong>${money(total)}</strong></div>
    <p class="note">Shipping and taxes calculated at checkout.</p>
    <a class="pill-btn" href="checkout.html">Checkout</a>`;
}

export function card(p) {
  const c = collectionOf(p);
  return `<article class="card" style="--tint:${c.tint}" data-id="${p.id}" data-type="${p.type}" data-ingredients="${p.ingredients.join('|')}">
    <span class="tag">${c.name}</span>
    <button class="quick" data-add="${p.id}" aria-label="Add ${p.name} to bag">${icons.bag}</button>
    <a class="img" href="product.html?id=${p.id}" aria-label="${p.name}">${packshot(p)}</a>
    <a class="meta" href="product.html?id=${p.id}"><span class="name">${p.name}</span><span class="price">${money(p.price)}</span></a>
  </article>`;
}

export function openCart(open = true) {
  document.body.classList.toggle('cart-open', open);
  document.querySelector('.drawer')?.setAttribute('aria-hidden', String(!open));
}

let toastTimer;
export function toast(msg) {
  const el = document.querySelector('.toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

export function observeReveals(root = document) {
  const io = new IntersectionObserver(entries => entries.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }), { threshold: .12 });
  root.querySelectorAll('.reveal:not(.in)').forEach(el => io.observe(el));
}

export function mountShell(active) {
  document.body.insertAdjacentHTML('afterbegin', header(active));
  document.body.insertAdjacentHTML('beforeend', footer() + drawer());

  const head = document.querySelector('.site-header');
  const onScroll = () => head.classList.toggle('scrolled', scrollY > 10);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  document.addEventListener('click', e => {
    const t = e.target.closest('button, a, [data-close-cart]');
    if (!t) return;
    if (t.dataset.add) addToCart(t.dataset.add);
    else if (t.matches('[data-open-cart]')) openCart(true);
    else if (t.matches('[data-close-cart]')) openCart(false);
    else if (t.dataset.qty) {
      const line = cart.find(l => l.id === t.dataset.qty);
      setQty(t.dataset.qty, line.qty + Number(t.dataset.d));
    } else if (t.dataset.remove) setQty(t.dataset.remove, 0);
    else if (t.matches('.menu-btn')) {
      const nav = document.querySelector('.nav');
      t.setAttribute('aria-expanded', String(nav.classList.toggle('open')));
    } else if (t.closest('.nav.open')) document.querySelector('.nav').classList.remove('open');
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') openCart(false); });
  document.querySelector('.bag-count').addEventListener('animationend', e => e.target.classList.remove('bump'));

  document.querySelector('[data-newsletter]').addEventListener('submit', e => {
    e.preventDefault();
    e.target.reset();
    toast('Thanks — you’re on the list');
  });

  renderCart();
}
