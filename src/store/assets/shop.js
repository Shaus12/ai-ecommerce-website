import { COLLECTIONS, PRODUCTS, TYPES, INGREDIENTS } from './products.js';
import { mountShell, icons, observeReveals, card } from './app.js';

mountShell('shop');

/* ---------- product rows ---------- */
const rows = document.querySelector('[data-rows]');
rows.innerHTML = COLLECTIONS.map(c => `
  <section class="row reveal" id="${c.id}" style="--tint:${c.tint}">
    <div class="row-head">
      <h2>${c.lead}<span class="serif">${c.name}</span></h2>
      <div class="arrows"><button data-dir="-1" aria-label="Previous">${icons.left}</button><button data-dir="1" aria-label="Next">${icons.right}</button></div>
    </div>
    <div class="track">${PRODUCTS.filter(p => p.collection === c.id).map(card).join('')}</div>
  </section>`).join('') + '<p class="empty" hidden>No products match these filters.</p>';

function syncArrows(row) {
  const t = row.querySelector('.track');
  const [prev, next] = row.querySelectorAll('.arrows button');
  prev.disabled = t.scrollLeft < 4;
  next.disabled = t.scrollLeft + t.clientWidth >= t.scrollWidth - 4;
}

rows.querySelectorAll('.row').forEach(row => {
  const t = row.querySelector('.track');
  t.addEventListener('scroll', () => syncArrows(row), { passive: true });
  row.querySelectorAll('.arrows button').forEach(b => b.addEventListener('click', () => {
    t.scrollBy({ left: Number(b.dataset.dir) * t.clientWidth * 0.68, behavior: 'smooth' });
  }));
  syncArrows(row);
});
addEventListener('resize', () => rows.querySelectorAll('.row').forEach(syncArrows));

/* ---------- filters ---------- */
const state = { type: null, ingredient: null };

const list = (key, items) => {
  document.querySelector(`[data-filter="${key}"]`).innerHTML =
    items.map(([value, label]) => `<li><button data-key="${key}" data-value="${value}">${label}</button></li>`).join('');
};
list('range', COLLECTIONS.map(c => [c.id, c.name]));
list('type', TYPES.map(t => [t, t]));
list('ingredient', INGREDIENTS.map(i => [i, i]));
document.querySelectorAll('.filter-group summary').forEach(s => s.insertAdjacentHTML('beforeend', icons.chevron));

function applyFilters() {
  let shown = 0;
  rows.querySelectorAll('.row').forEach(row => {
    let inRow = 0;
    row.querySelectorAll('.card').forEach(cardEl => {
      const ok = (!state.type || cardEl.dataset.type === state.type)
        && (!state.ingredient || cardEl.dataset.ingredients.split('|').includes(state.ingredient));
      cardEl.hidden = !ok;
      inRow += ok;
    });
    row.hidden = !inRow;
    shown += inRow;
    if (inRow) { row.querySelector('.track').scrollLeft = 0; syncArrows(row); }
  });
  rows.querySelector('.empty').hidden = shown > 0;
  document.querySelectorAll('[data-key="type"], [data-key="ingredient"]').forEach(b => {
    b.classList.toggle('on', state[b.dataset.key] === b.dataset.value);
  });
  document.querySelector('[data-clear]').classList.toggle('show', Boolean(state.type || state.ingredient));
}

document.querySelector('.filters').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.matches('[data-clear]')) { state.type = state.ingredient = null; applyFilters(); return; }
  const { key, value } = b.dataset;
  if (key === 'range') {
    const row = document.getElementById(value);
    if (row.hidden) { state.type = state.ingredient = null; applyFilters(); }
    row.scrollIntoView({ behavior: 'smooth' });
    return;
  }
  state[key] = state[key] === value ? null : value;
  applyFilters();
  document.getElementById('shop').scrollIntoView({ behavior: 'smooth' });
});

/* ---------- ritual steps ---------- */
const STEPS = [
  ['Cleanse', 'Oil first, then a low-pH foam. Clean skin, never stripped.', 'Cleanser'],
  ['Tone', 'Rebalance and prep with thin, watery layers.', 'Toner'],
  ['Treat', 'Essences and serums target glow, calm or firmness.', 'Serum'],
  ['Moisturize', 'Seal everything in with a cream that suits your skin.', 'Moisturizer'],
  ['Protect', 'Every morning, SPF. The real Korean secret.', 'Sun Care'],
];
document.querySelector('[data-steps]').innerHTML = STEPS.map(([name, text, type], i) => `
  <div class="step reveal" style="--tint:${COLLECTIONS[i].tint};transition-delay:${i * 80}ms">
    <b>0${i + 1}</b>
    <div><h4>${name}</h4><p>${text}</p><a href="#shop" data-step-type="${type}">Shop ${type.toLowerCase()}</a></div>
  </div>`).join('');
document.querySelector('[data-steps]').addEventListener('click', e => {
  const a = e.target.closest('[data-step-type]');
  if (!a) return;
  e.preventDefault();
  state.type = a.dataset.stepType;
  state.ingredient = null;
  applyFilters();
  document.getElementById('shop').scrollIntoView({ behavior: 'smooth' });
});

observeReveals();

// Rows are rendered here, after the browser's own jump to the #hash.
if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
