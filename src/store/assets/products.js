/**
 * SO.KI catalog. Plain data so it can later be swapped for a Shopify
 * (or any other) product feed without touching the page code.
 * `art` drives the drawn packshot in art.js; `glass` and `cap` colour it.
 */

export const COLLECTIONS = [
  { id: 'glass-glow', name: 'Glass Glow', lead: 'For Luminous, Glass-Like Skin,', tint: '#ecc9c9', accent: '#d9a5a5' },
  { id: 'hanbang', name: 'Hanbang Ritual', lead: 'A Blend of Korean Herbs & Science,', tint: '#ddd2c4', accent: '#bfae98' },
  { id: 'dew-drop', name: 'Dew Drop', lead: 'For Deep, Lasting Moisture,', tint: '#d4cce2', accent: '#ada0c6' },
  { id: 'cica-calm', name: 'Cica Calm', lead: 'For Calming Redness & Breakouts,', tint: '#c7d0cb', accent: '#9fb0a6' },
  { id: 'sun-veil', name: 'Sun Veil', lead: 'For Everyday Light Protection,', tint: '#f1dcc4', accent: '#dfbb93' },
];

export const TYPES = ['Cleanser', 'Toner', 'Essence', 'Serum', 'Moisturizer', 'Mask', 'Sun Care'];
export const INGREDIENTS = ['Rice', 'Ginseng', 'Centella', 'Hyaluronic Acid', 'Niacinamide', 'Snail Mucin', 'Green Tea', 'Ceramides'];

export const PRODUCTS = [
  // Glass Glow
  {
    id: 'rice-glow-toner', collection: 'glass-glow', type: 'Toner', name: 'Rice Water Glow Toner', price: 24, size: '150 ml',
    tagline: 'milky, brightening first step', art: 'toner', glass: '#f4ece4', cap: '#c9a27a',
    ingredients: ['Rice', 'Niacinamide'],
    about: 'A milky toner made with 70% fermented rice water that softens, preps and leaves skin with a soft, lit-from-within glow.',
    benefits: ['Evens out dullness', 'Softens rough texture', 'Preps skin to absorb serums'],
    keyIngredients: [['Fermented rice water', 'Brightens and softens'], ['Niacinamide 2%', 'Refines the look of pores']],
    howTo: 'After cleansing, pat into skin with palms or sweep on with a cotton pad. Morning and night.',
  },
  {
    id: 'glass-skin-serum', collection: 'glass-glow', type: 'Serum', name: 'Glass Skin Niacinamide Serum', price: 32, size: '30 ml',
    tagline: 'clear, even, reflective skin', art: 'dropper', glass: '#d98a7f', cap: '#2e2a28',
    ingredients: ['Niacinamide', 'Rice'],
    about: 'A lightweight serum with 10% niacinamide and rice ceramides that targets uneven tone for that glassy Korean finish.',
    benefits: ['Fades the look of dark spots', 'Balances oil', 'Smooths and plumps'],
    keyIngredients: [['Niacinamide 10%', 'Evens skin tone'], ['Rice ceramides', 'Strengthens the barrier']],
    howTo: 'Apply 2–3 drops after toner. Follow with moisturizer.',
  },
  {
    id: 'rice-sleeping-mask', collection: 'glass-glow', type: 'Mask', name: 'Rice Overnight Sleeping Mask', price: 28, size: '70 ml',
    tagline: 'wake up rested, dewy skin', art: 'jar', glass: '#f6ddd8', cap: '#e9b9b1',
    ingredients: ['Rice', 'Ceramides'],
    about: 'A bouncy gel-cream that works while you sleep, sealing in moisture so you wake up to rested, glowing skin.',
    benefits: ['Locks in hydration overnight', 'Restores glow', 'Non-sticky finish'],
    keyIngredients: [['Rice bran extract', 'Nourishes and brightens'], ['Ceramide NP', 'Seals in moisture']],
    howTo: 'As the last step of your night routine, smooth a thin layer over face. Rinse in the morning.',
  },
  {
    id: 'glow-cleansing-foam', collection: 'glass-glow', type: 'Cleanser', name: 'Low-pH Glow Cleansing Foam', price: 18, size: '120 ml',
    tagline: 'gentle, never tight', art: 'tube', glass: '#f8e6e2', cap: '#d9a5a5',
    ingredients: ['Rice', 'Green Tea'],
    about: 'A soft, pH-balanced foam that lifts away makeup residue and sunscreen without stripping skin.',
    benefits: ['Cleans without dryness', 'pH 5.5', 'Fragrance free'],
    keyIngredients: [['Rice powder', 'Gently polishes'], ['Green tea', 'Soothes and protects']],
    howTo: 'Lather a pea-sized amount with water, massage over damp skin, rinse.',
  },

  // Hanbang Ritual
  {
    id: 'ginseng-first-essence', collection: 'hanbang', type: 'Essence', name: 'Red Ginseng First Essence', price: 38, size: '120 ml',
    tagline: 'the ritual starts here', art: 'toner', glass: '#8a4a2f', cap: '#c9a27a',
    ingredients: ['Ginseng'],
    about: 'A rich first essence inspired by Korean hanbang medicine, with six-year Korean red ginseng to energise tired skin.',
    benefits: ['Revives dull, tired skin', 'Firms and plumps', 'Deeply nourishing'],
    keyIngredients: [['Korean red ginseng', 'Energises and firms'], ['Licorice root', 'Calms and brightens']],
    howTo: 'Pour into palms and press into skin after cleansing, before serum.',
  },
  {
    id: 'ginseng-renewal-serum', collection: 'hanbang', type: 'Serum', name: 'Ginseng Renewal Serum', price: 44, size: '30 ml',
    tagline: 'firmer, bouncier skin', art: 'dropper', glass: '#9c5531', cap: '#c9a27a',
    ingredients: ['Ginseng', 'Niacinamide'],
    about: 'A concentrated serum with ginseng saponins and peptides that helps skin feel firmer and look more resilient.',
    benefits: ['Visibly firms', 'Softens fine lines', 'Restores bounce'],
    keyIngredients: [['Ginseng saponins', 'Supports elasticity'], ['Peptide complex', 'Smooths fine lines']],
    howTo: 'Warm 3 drops between fingertips and press into face and neck, morning and night.',
  },
  {
    id: 'hanbang-cleansing-oil', collection: 'hanbang', type: 'Cleanser', name: 'Herbal Cleansing Oil', price: 26, size: '200 ml',
    tagline: 'melts away the day', art: 'pump', glass: '#c08a52', cap: '#2e2a28',
    ingredients: ['Ginseng', 'Green Tea'],
    about: 'The first step of the Korean double cleanse. A silky oil that dissolves makeup and SPF, then rinses clean.',
    benefits: ['Removes waterproof makeup', 'Lifts sebum from pores', 'Leaves skin soft'],
    keyIngredients: [['Camellia oil', 'Nourishes'], ['Herbal blend', 'Soothes and balances']],
    howTo: 'Massage 2 pumps onto dry skin, add water to emulsify, rinse. Follow with a foam cleanser.',
  },

  // Dew Drop
  {
    id: 'hyaluronic-toner', collection: 'dew-drop', type: 'Toner', name: 'Hyaluronic Deep Moisture Toner', price: 22, size: '200 ml',
    tagline: 'layer it, seven-skin style', art: 'toner', glass: '#e9e4f2', cap: '#ada0c6',
    ingredients: ['Hyaluronic Acid'],
    about: 'A water-light toner with five weights of hyaluronic acid, made to be layered in the Korean seven-skin method.',
    benefits: ['Instant hydration', 'Plumps fine lines', 'Layers without stickiness'],
    keyIngredients: [['5 types of hyaluronic acid', 'Hydrates every layer'], ['Panthenol', 'Soothes']],
    howTo: 'Pat in 1 to 7 thin layers after cleansing, letting each sink in.',
  },
  {
    id: 'snail-essence', collection: 'dew-drop', type: 'Essence', name: '96 Snail Mucin Essence', price: 25, size: '100 ml',
    tagline: 'the cult repair essence', art: 'pump', glass: '#f1eef6', cap: '#ada0c6',
    ingredients: ['Snail Mucin', 'Hyaluronic Acid'],
    about: 'A silky essence with 96% snail secretion filtrate that repairs, hydrates and gives skin a healthy bounce.',
    benefits: ['Repairs and soothes', 'Fades the look of marks', 'Bouncy, dewy finish'],
    keyIngredients: [['Snail secretion filtrate 96%', 'Repairs and hydrates'], ['Sodium hyaluronate', 'Locks in water']],
    howTo: 'After toner, pump 1–2 times and spread over face. Pat until absorbed.',
  },
  {
    id: 'water-cream', collection: 'dew-drop', type: 'Moisturizer', name: 'Ceramide Water Cream', price: 30, size: '50 ml',
    tagline: 'weightless, all-day dew', art: 'jar', glass: '#e7e1f0', cap: '#ada0c6',
    ingredients: ['Ceramides', 'Hyaluronic Acid'],
    about: 'A gel-cream that bursts into water on contact, delivering ceramides and moisture without heaviness.',
    benefits: ['72-hour hydration', 'Strengthens skin barrier', 'Great under makeup'],
    keyIngredients: [['Ceramide complex', 'Repairs the barrier'], ['Hyaluronic acid', 'Draws in moisture']],
    howTo: 'Smooth over face as the last step of your routine, morning and night.',
  },
  {
    id: 'peptide-eye-cream', collection: 'dew-drop', type: 'Moisturizer', name: 'Peptide Eye Cream', price: 29, size: '20 ml',
    tagline: 'brighter, smoother eyes', art: 'tube', glass: '#ece7f4', cap: '#ada0c6',
    ingredients: ['Niacinamide', 'Ceramides'],
    about: 'A cushiony eye cream with peptides and caffeine that smooths and brightens the delicate under-eye area.',
    benefits: ['Softens crow’s feet', 'Reduces puffiness', 'Brightens dark circles'],
    keyIngredients: [['Peptides', 'Smooth fine lines'], ['Caffeine', 'De-puffs']],
    howTo: 'Tap a rice-grain amount around the orbital bone with your ring finger.',
  },

  // Cica Calm
  {
    id: 'centella-ampoule', collection: 'cica-calm', type: 'Serum', name: 'Centella Calming Ampoule', price: 27, size: '55 ml',
    tagline: 'instant calm for red skin', art: 'dropper', glass: '#7f9a86', cap: '#2e2a28',
    ingredients: ['Centella'],
    about: 'A concentrated ampoule of 100% centella asiatica extract that calms redness and supports stressed skin.',
    benefits: ['Calms visible redness', 'Supports healing', 'Gentle enough for daily use'],
    keyIngredients: [['Centella asiatica extract', 'Soothes and repairs'], ['Madecassoside', 'Calms irritation']],
    howTo: 'Apply 3–4 drops after toner, morning and night.',
  },
  {
    id: 'bha-clearing-toner', collection: 'cica-calm', type: 'Toner', name: 'BHA Tea Tree Clearing Toner', price: 21, size: '150 ml',
    tagline: 'clear pores, calm skin', art: 'toner', glass: '#a9bfb0', cap: '#2e2a28',
    ingredients: ['Centella', 'Green Tea'],
    about: 'A gentle exfoliating toner with BHA and tea tree to keep pores clear and breakouts in check.',
    benefits: ['Unclogs pores', 'Reduces breakouts', 'Smooths texture'],
    keyIngredients: [['Salicylic acid 0.5%', 'Exfoliates inside pores'], ['Tea tree', 'Purifies']],
    howTo: 'Sweep over face with a cotton pad in the evening. Start every other day.',
  },
  {
    id: 'cica-barrier-cream', collection: 'cica-calm', type: 'Moisturizer', name: 'Cica Barrier Repair Cream', price: 26, size: '50 ml',
    tagline: 'comfort for sensitive skin', art: 'jar', glass: '#dce5df', cap: '#7f9a86',
    ingredients: ['Centella', 'Ceramides'],
    about: 'A rich but breathable cream that rebuilds a stressed barrier with cica and ceramides.',
    benefits: ['Repairs the barrier', 'Relieves tightness', 'Calms redness'],
    keyIngredients: [['Cica', 'Soothes'], ['Ceramides', 'Repair and protect']],
    howTo: 'Apply as your last skincare step. Layer extra on dry areas.',
  },
  {
    id: 'cica-sheet-mask', collection: 'cica-calm', type: 'Mask', name: 'Cica Rescue Sheet Mask (5 pack)', price: 15, size: '5 × 25 ml',
    tagline: 'twenty minutes of calm', art: 'pouch', glass: '#b9c9be', cap: '#7f9a86',
    ingredients: ['Centella', 'Green Tea'],
    about: 'A soaked bio-cellulose sheet mask that delivers a concentrated dose of centella to flushed, tired skin.',
    benefits: ['Instant soothing', 'Deep hydration', 'Cooling feel'],
    keyIngredients: [['Centella asiatica', 'Calms'], ['Green tea', 'Antioxidant']],
    howTo: 'After toner, apply mask for 15–20 minutes. Pat in the remaining essence.',
  },

  // Sun Veil
  {
    id: 'rice-sun-fluid', collection: 'sun-veil', type: 'Sun Care', name: 'Rice Probiotic Sun Fluid SPF 50+', price: 23, size: '50 ml',
    tagline: 'no white cast, no greasiness', art: 'tube', glass: '#fbeee0', cap: '#dfbb93',
    ingredients: ['Rice', 'Niacinamide'],
    about: 'A featherlight Korean sunscreen with a moisturising finish that wears comfortably every single day.',
    benefits: ['Broad-spectrum SPF 50+ PA++++', 'No white cast', 'Works under makeup'],
    keyIngredients: [['Rice extract', 'Nourishes'], ['Probiotics', 'Supports the skin barrier']],
    howTo: 'Apply generously as the last skincare step. Reapply every 2 hours in the sun.',
  },
  {
    id: 'tone-up-cream', collection: 'sun-veil', type: 'Sun Care', name: 'Tone-Up Sun Cream SPF 50', price: 25, size: '50 ml',
    tagline: 'a soft-focus, brighter base', art: 'pump', glass: '#f6e6d6', cap: '#dfbb93',
    ingredients: ['Niacinamide', 'Green Tea'],
    about: 'A rosy tone-up sunscreen that instantly brightens and blurs, so you can skip foundation.',
    benefits: ['Brightens instantly', 'Blurs pores', 'Primer + SPF in one'],
    keyIngredients: [['Niacinamide', 'Brightens'], ['Green tea', 'Antioxidant defence']],
    howTo: 'Apply evenly to face as the last step of your morning routine.',
  },
  {
    id: 'glow-cushion', collection: 'sun-veil', type: 'Sun Care', name: 'Glow Cushion SPF 40', price: 34, size: '15 g',
    tagline: 'sheer coverage, on the go', art: 'cushion', glass: '#efd2b6', cap: '#c9a27a',
    ingredients: ['Hyaluronic Acid', 'Niacinamide'],
    about: 'The iconic Korean cushion compact: sheer, buildable coverage with SPF and a dewy finish.',
    benefits: ['Buildable coverage', 'SPF 40 PA+++', 'Easy touch-ups'],
    keyIngredients: [['Hyaluronic acid', 'Keeps skin dewy'], ['Niacinamide', 'Evens tone']],
    howTo: 'Press the puff into the cushion and tap onto skin from the centre outwards.',
  },
];

export const byId = id => PRODUCTS.find(p => p.id === id);
export const collectionOf = p => COLLECTIONS.find(c => c.id === p.collection);
export const money = n => `$${n.toFixed(2)}`;
