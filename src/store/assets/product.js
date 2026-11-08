import { PRODUCTS, byId, collectionOf, money } from './products.js';
import { packshot } from './art.js';
import { mountShell, addToCart, openCart, card, observeReveals, FREE_SHIPPING } from './app.js';

mountShell('shop');

const main = document.querySelector('[data-pdp]');
const p = byId(new URLSearchParams(location.search).get('id'));

if (!p) {
  main.innerHTML = `<div class="missing"><h1 class="serif" style="font-size:48px;margin:0 0 12px">Not found</h1>
    <p>We couldn’t find that product.</p><a class="pill-btn" style="width:auto" href="index.html#shop">Back to shop</a></div>`;
} else {
  const c = collectionOf(p);
  document.title = `${p.name} — SO.KI`;
  document.querySelector('meta[name="description"]')?.remove();
  document.head.insertAdjacentHTML('beforeend', `<meta name="description" content="${p.about}">`);

  // Same collection first, then the next ritual steps from elsewhere.
  const related = [
    ...PRODUCTS.filter(x => x.collection === p.collection && x.id !== p.id),
    ...PRODUCTS.filter(x => x.collection !== p.collection && x.type !== p.type),
  ].slice(0, 8);

  main.innerHTML = `
    <section class="pdp" style="--tint:${c.tint}">
      <nav class="crumbs"><a href="index.html#shop">Shop</a> / <a href="index.html#${c.id}">${c.name}</a> / ${p.type}</nav>
      <div class="gallery"><span class="tag">${c.name}</span>${packshot(p)}</div>
      <div class="info">
        <span class="eyebrow">${p.type} · ${p.size}</span>
        <h1>${p.name}</h1>
        <p class="tagline">${p.tagline}</p>
        <div class="price-row"><strong>${money(p.price)}</strong><span>${p.price >= FREE_SHIPPING ? 'Ships free in the US' : `Free US shipping over ${money(FREE_SHIPPING)}`}</span></div>
        <p class="about">${p.about}</p>
        <div class="buy">
          <div class="qty"><button data-step="-1" aria-label="Less">−</button><span data-q>1</span><button data-step="1" aria-label="More">+</button></div>
          <button class="pill-btn" data-buy>Add to bag — ${money(p.price)}</button>
        </div>
        <p class="perks">Authentic, made in Korea · Cruelty free · 30-day returns</p>
        <details class="acc" open><summary>Benefits</summary><div><ul>${p.benefits.map(b => `<li>${b}</li>`).join('')}</ul></div></details>
        <details class="acc"><summary>Key ingredients</summary><div><dl>${p.keyIngredients.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl></div></details>
        <details class="acc"><summary>How to use</summary><div>${p.howTo}</div></details>
      </div>
    </section>
    <section class="related row reveal" style="--tint:${c.tint}">
      <div class="row-head"><h2>Complete the<span class="serif">ritual</span></h2></div>
      <div class="track">${related.map(card).join('')}</div>
    </section>`;

  let qty = 1;
  const qEl = main.querySelector('[data-q]');
  const buy = main.querySelector('[data-buy]');
  main.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => {
    qty = Math.max(1, Math.min(10, qty + Number(b.dataset.step)));
    qEl.textContent = qty;
    buy.textContent = `Add to bag — ${money(qty * p.price)}`;
  }));
  buy.addEventListener('click', () => { addToCart(p.id, qty); openCart(true); });
}

observeReveals();
