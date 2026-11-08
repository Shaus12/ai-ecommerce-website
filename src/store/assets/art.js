/**
 * Drawn packshots. Until real product photography exists, every product
 * gets an SVG bottle / jar / tube in its own glass and cap colours.
 * Shapes share a 300×400 canvas with a soft floor shadow.
 */

let uid = 0;

const shade = (hex, amt) => {
  const n = parseInt(hex.slice(1), 16);
  const c = s => Math.max(0, Math.min(255, ((n >> s) & 255) + amt));
  return `#${((c(16) << 16) | (c(8) << 8) | c(0)).toString(16).padStart(6, '0')}`;
};

const isDark = hex => {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11 < 150;
};

function defs(id, glass, cap) {
  return `<defs>
    <linearGradient id="g${id}" x1="0" x2="1">
      <stop offset="0" stop-color="${shade(glass, -28)}"/>
      <stop offset=".35" stop-color="${shade(glass, 14)}"/>
      <stop offset=".7" stop-color="${glass}"/>
      <stop offset="1" stop-color="${shade(glass, -36)}"/>
    </linearGradient>
    <linearGradient id="c${id}" x1="0" x2="1">
      <stop offset="0" stop-color="${shade(cap, -30)}"/>
      <stop offset=".4" stop-color="${shade(cap, 28)}"/>
      <stop offset="1" stop-color="${shade(cap, -40)}"/>
    </linearGradient>
    <radialGradient id="s${id}"><stop offset="0" stop-color="#000" stop-opacity=".22"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
  </defs>`;
}

function label(x, y, w, ink, name, vertical = false) {
  const words = name.split(' ').slice(0, 3).join(' ').toUpperCase();
  if (vertical) {
    return `<g fill="${ink}" font-family="Manrope, sans-serif" text-anchor="middle">
      <text x="${x}" y="${y}" font-size="15" font-weight="700" letter-spacing="1">SO.KI</text>
      <text x="${x}" y="${y + 16}" font-size="6.5" letter-spacing="1" opacity=".8">${words}</text></g>`;
  }
  return `<g fill="${ink}" font-family="Manrope, sans-serif" text-anchor="middle">
    <text x="${x + w / 2}" y="${y}" font-size="16" font-weight="700" letter-spacing="1.5">SO.KI</text>
    <text x="${x + w / 2}" y="${y + 15}" font-size="6.5" letter-spacing="1.2" opacity=".75">${words}</text>
    <rect x="${x + w / 2 - 14}" y="${y + 24}" width="28" height=".8" opacity=".5"/></g>`;
}

const shine = (x, y, h) => `<rect x="${x}" y="${y}" width="7" height="${h}" rx="3.5" fill="#fff" opacity=".28"/>`;

const SHAPES = {
  dropper(id, p, ink) {
    return `<ellipse cx="150" cy="352" rx="70" ry="10" fill="url(#s${id})"/>
      <rect x="138" y="70" width="24" height="44" rx="12" fill="url(#c${id})"/>
      <rect x="128" y="108" width="44" height="46" rx="4" fill="url(#c${id})"/>
      <rect x="146" y="150" width="8" height="150" fill="#fff" opacity=".18"/>
      <path d="M98 168q0-16 16-16h72q16 0 16 16v168q0 14-14 14h-76q-14 0-14-14z" fill="url(#g${id})"/>
      ${shine(108, 172, 150)}
      ${label(98, 238, 104, ink, p.name)}`;
  },
  pump(id, p, ink) {
    return `<ellipse cx="150" cy="352" rx="62" ry="10" fill="url(#s${id})"/>
      <path d="M150 52h52v14h-36v10h-16z" fill="url(#c${id})"/>
      <rect x="138" y="72" width="24" height="36" rx="3" fill="url(#c${id})"/>
      <rect x="126" y="104" width="48" height="26" rx="5" fill="url(#c${id})"/>
      <rect x="104" y="128" width="92" height="222" rx="20" fill="url(#g${id})"/>
      ${shine(114, 142, 190)}
      ${label(104, 226, 92, ink, p.name)}`;
  },
  toner(id, p, ink) {
    return `<ellipse cx="150" cy="352" rx="64" ry="10" fill="url(#s${id})"/>
      <rect x="122" y="60" width="56" height="58" rx="6" fill="url(#c${id})"/>
      <rect x="132" y="114" width="36" height="14" fill="${shade(p.glass, -20)}"/>
      <path d="M100 150q0-24 24-24h52q24 0 24 24v186q0 14-14 14h-72q-14 0-14-14z" fill="url(#g${id})"/>
      ${shine(110, 148, 180)}
      ${label(100, 228, 100, ink, p.name)}`;
  },
  jar(id, p, ink) {
    return `<ellipse cx="150" cy="342" rx="98" ry="14" fill="url(#s${id})"/>
      <rect x="68" y="196" width="164" height="146" rx="18" fill="url(#g${id})"/>
      <rect x="62" y="150" width="176" height="56" rx="10" fill="url(#c${id})"/>
      <rect x="62" y="196" width="176" height="6" fill="#000" opacity=".08"/>
      ${shine(80, 212, 112)}
      ${label(68, 266, 164, ink, p.name)}`;
  },
  tube(id, p, ink) {
    return `<ellipse cx="150" cy="356" rx="58" ry="9" fill="url(#s${id})"/>
      <path d="M96 56h108l-14 232h-80z" fill="url(#g${id})"/>
      <rect x="92" y="50" width="116" height="12" rx="2" fill="${shade(p.glass, -22)}"/>
      <rect x="114" y="286" width="72" height="66" rx="8" fill="url(#c${id})"/>
      ${shine(108, 70, 190)}
      ${label(102, 150, 96, ink, p.name)}`;
  },
  cushion(id, p, ink) {
    return `<ellipse cx="150" cy="318" rx="118" ry="20" fill="url(#s${id})"/>
      <ellipse cx="150" cy="288" rx="106" ry="34" fill="${shade(p.cap, -40)}"/>
      <rect x="44" y="250" width="212" height="38" fill="url(#c${id})"/>
      <ellipse cx="150" cy="250" rx="106" ry="34" fill="url(#g${id})"/>
      <ellipse cx="150" cy="250" rx="80" ry="24" fill="#fff" opacity=".18"/>
      <text x="150" y="256" text-anchor="middle" font-family="Manrope, sans-serif" font-weight="700" font-size="17" letter-spacing="2" fill="${ink}">SO.KI</text>`;
  },
  pouch(id, p, ink) {
    return `<ellipse cx="150" cy="356" rx="80" ry="10" fill="url(#s${id})"/>
      <path d="M80 70h140l6 10-6 10 6 10-6 10v232H80V110l-6-10 6-10-6-10 6-10z" fill="url(#g${id})"/>
      <rect x="80" y="70" width="140" height="22" fill="${shade(p.glass, -18)}"/>
      <circle cx="150" cy="210" r="40" fill="${p.cap}" opacity=".35"/>
      <path d="M150 182c14 14 14 42 0 56-14-14-14-42 0-56z" fill="${p.cap}" opacity=".7"/>
      ${shine(90, 100, 230)}
      ${label(80, 284, 140, ink, p.name)}`;
  },
};

export function packshot(p) {
  const id = ++uid;
  const ink = isDark(p.glass) ? '#f6efe8' : '#3b3b3b';
  const shape = SHAPES[p.art] ?? SHAPES.toner;
  return `<svg viewBox="0 0 300 400" role="img" aria-label="${p.name}" xmlns="http://www.w3.org/2000/svg">
    ${defs(id, p.glass, p.cap)}${shape(id, p, ink)}</svg>`;
}
