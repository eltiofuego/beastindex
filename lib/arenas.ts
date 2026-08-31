import type { Arena, ArenaKey, PoolKey } from './types';

export const ARENAS: Record<ArenaKey, Arena> = {
  fit: {
    word: 'FIT', name: 'Bodyweight arena', accent: '#E8A722', photo: '/img/fit.jpeg',
    crop: 'One athlete, a shadowed park', verb: 'fitter than', help: '',
    ranks: [
      ['Sloth', 'Bradypus otiosus', 'The couch fears nothing.'],
      ['Meerkat', 'Suricata vigilans', 'Upright, alert, powered mostly by panic.'],
      ['Mountain Goat', 'Oreamnos firmus', 'Sure footed. Nobody worries about you.'],
      ['Spider Monkey', 'Ateles pendulus', 'Pull-ups look free from here.'],
      ['Orangutan', 'Pongo tenax', 'Long arms, longer sets, never in a hurry.'],
      ['Silverback', 'Gorilla dominans', 'The gym is your living room.'],
    ],
    metrics: [
      { k: 'situps', label: 'Sit-ups', hint: 'reps in 1 minute', ref: 'situps', unit: 'reps' },
      { k: 'jump', label: 'Standing broad jump', hint: 'cm, best of three', ref: 'jump', unit: 'cm' },
      { k: 'reach', label: 'Sit and reach', hint: 'cm past your toes, minus if short', ref: 'reach', signed: true, unit: 'cm' },
    ],
  },
  strong: {
    word: 'STRONG', name: 'Barbell arena', accent: '#C61F1F', photo: '/img/strong.jpeg',
    crop: 'One lifter, a dark arena', verb: 'stronger than',
    help: 'Enter any set, e.g. 80 kg x 5. We convert it to your estimated one-rep max.',
    ranks: [
      ['House Cat', 'Felis mollis', 'Warm, soft, completely uninterested in the barbell.'],
      ['Goat', 'Capra obstinata', 'Stubborn beyond reason. It counts for something.'],
      ['Ox', 'Bos laborans', 'You move the weight. No ceremony.'],
      ['Grizzly', 'Ursus gravis', 'People re-rack faster when you walk past.'],
      ['Gorilla', 'Gorilla ferreus', 'The racks go quiet when you walk in.'],
      ['Mammoth', 'Mammuthus redivivus', 'Extinct numbers. Somehow still lifting.'],
    ],
    metrics: [
      { k: 'squat', label: 'Squat', hint: 'weight x reps', ref: 'squat', load: true, unit: 'kg' },
      { k: 'bench', label: 'Bench press', hint: 'weight x reps', ref: 'bench', load: true, unit: 'kg' },
      { k: 'deadlift', label: 'Deadlift', hint: 'weight x reps', ref: 'deadlift', load: true, unit: 'kg' },
    ],
  },
  fast: {
    word: 'FAST', name: 'Speed arena', accent: '#1E5BE8', photo: '/img/fast.jpeg',
    crop: 'One runner, the whole field', verb: 'faster than',
    help: "Any one distance is enough. Shorter races are converted to a marathon-equivalent with Riegel's formula, then ranked against real finishers.",
    ranks: [
      ['Tortoise', 'Testudo perseverans', 'You will finish. Eventually.'],
      ['Hare', 'Lepus impatiens', 'Fast starts, honest regrets.'],
      ['Greyhound', 'Canis velox', 'Built to chase things.'],
      ['Horse', 'Equus fortis', 'Big engine, no drama.'],
      ['Cheetah', 'Acinonyx fulminans', 'Terrifying for exactly this distance.'],
      ['Peregrine Falcon', 'Falco descendens', 'You do not run. You descend.'],
    ],
    metrics: [
      { k: 'r5k', label: '5K', hint: 'mm:ss', ref: 'marathon', time: true, dist: 5000 },
      { k: 'r10k', label: '10K', hint: 'mm:ss', ref: 'marathon', time: true, dist: 10000 },
      { k: 'rhalf', label: 'Half marathon', hint: 'h:mm:ss', ref: 'marathon', time: true, dist: 21097.5 },
      { k: 'rfull', label: 'Marathon', hint: 'h:mm:ss', ref: 'marathon', time: true, dist: 42195 },
    ],
  },
};

export const ORDER: ArenaKey[] = ['fit', 'strong', 'fast'];
export const TIERS = [0, 20, 40, 62, 80, 93];

export const ART: Record<string, string> = {
  Grizzly: '/img/animals/grizzly.jpeg',
  Cheetah: '/img/animals/cheetah.jpeg',
  Sloth: '/img/animals/sloth.jpeg',
};

export const POOLS: Record<PoolKey, { name: string; who: string; desc: string }> = {
  everyone:    { name: 'Everyone', who: 'the general public',
                 desc: 'A national fitness survey of the general public — trained or not.' },
  firsttimers: { name: 'First-timers', who: 'first-time competitors',
                 desc: 'People at their first ever meet. Trained alone, then entered once.' },
  competitors: { name: 'Competitors', who: 'competitive lifters',
                 desc: 'Every logged competition lift, novice to world record.' },
  trained:     { name: 'Marathoners', who: 'marathon finishers',
                 desc: 'Everyone who finished the 2025 New York City Marathon.' },
};

export const REGION_OF: Record<string, string[]> = {
  'Southeast Asia': ['Indonesia', 'Malaysia', 'Singapore', 'Philippines', 'Thailand', 'Vietnam'],
  'East Asia': ['Japan', 'China', 'Taiwan', 'South Korea', 'Hong Kong'],
  'North America': ['United States', 'Canada', 'Mexico'],
  'Western Europe': ['Germany', 'France', 'United Kingdom', 'Finland', 'Poland', 'Sweden',
    'Norway', 'Netherlands', 'Spain', 'Italy', 'Ireland', 'Denmark', 'Belgium', 'Austria', 'Czechia'],
  'Eastern Europe': ['Russia', 'Ukraine', 'Belarus', 'Kazakhstan', 'Latvia', 'Lithuania', 'Estonia'],
  Oceania: ['Australia', 'New Zealand'],
};
export function regionOfCountry(name: string): string | null {
  for (const [r, cs] of Object.entries(REGION_OF)) if (cs.includes(name)) return r;
  return null;
}

/* Published course cutoffs for the six World Marathon Majors. A time past these is
   not an official finish at that race — see scoring.ts `cutoffNotices`. NYC has no
   strict cutoff, which is why its own dataset contains finishes beyond 12 hours. */
export const MARATHON_CUTOFFS: { race: string; seconds: number }[] = [
  { race: 'Boston',  seconds: 6 * 3600 },
  { race: 'Berlin',  seconds: 6 * 3600 + 15 * 60 },
  { race: 'Chicago', seconds: 6 * 3600 + 30 * 60 },
  { race: 'Tokyo',   seconds: 7 * 3600 },
  { race: 'London',  seconds: 8 * 3600 },
];
