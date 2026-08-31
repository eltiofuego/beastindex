/* BEASTINDEX — client-side scoring against measured reference distributions.
   No backend: web/data/reference.json holds empirical percentile curves built by
   data/build_reference.py from OpenPowerlifting, NHANES, NYC Marathon and KSPO. */

'use strict';

/* ─────────────── arena definitions (copy from the design file) ─────────────── */
const ARENAS = {
  fit: {
    word:'FIT', name:'Bodyweight arena', accent:'#E8A722', photo:'img/fit.jpeg',
    pos:'70% 50%', crop:'One athlete, a shadowed park', verb:'fitter than',
    help:'', ranks:[
      ['Sloth','Bradypus otiosus','The couch fears nothing.'],
      ['Meerkat','Suricata vigilans','Upright, alert, powered mostly by panic.'],
      ['Mountain Goat','Oreamnos firmus','Sure footed. Nobody worries about you.'],
      ['Spider Monkey','Ateles pendulus','Pull-ups look free from here.'],
      ['Orangutan','Pongo tenax','Long arms, longer sets, never in a hurry.'],
      ['Silverback','Gorilla dominans','The gym is your living room.']],
    metrics:[
      {k:'situps',label:'Sit-ups',hint:'reps in 1 minute',ref:'situps'},
      {k:'jump',label:'Standing broad jump',hint:'cm, best of three',ref:'jump'},
      {k:'reach',label:'Sit and reach',hint:'cm past your toes, minus if short',ref:'reach',signed:true}]
  },
  strong: {
    word:'STRONG', name:'Barbell arena', accent:'#C61F1F', photo:'img/strong.jpeg',
    pos:'66% 50%', crop:'One lifter, a dark arena', verb:'stronger than',
    help:'Enter any set, e.g. 80 kg x 5. We convert it to your estimated one-rep max.',
    ranks:[
      ['House Cat','Felis mollis','Warm, soft, completely uninterested in the barbell.'],
      ['Goat','Capra obstinata','Stubborn beyond reason. It counts for something.'],
      ['Ox','Bos laborans','You move the weight. No ceremony.'],
      ['Grizzly','Ursus gravis','People re-rack faster when you walk past.'],
      ['Gorilla','Gorilla ferreus','The racks go quiet when you walk in.'],
      ['Mammoth','Mammuthus redivivus','Extinct numbers. Somehow still lifting.']],
    metrics:[
      {k:'squat',label:'Squat',hint:'weight x reps',ref:'squat',load:true},
      {k:'bench',label:'Bench press',hint:'weight x reps',ref:'bench',load:true},
      {k:'deadlift',label:'Deadlift',hint:'weight x reps',ref:'deadlift',load:true}]
  },
  fast: {
    word:'FAST', name:'Speed arena', accent:'#1E5BE8', photo:'img/fast.jpeg',
    pos:'68% 50%', crop:'One runner, the whole field', verb:'faster than',
    help:'Any one distance is enough. Shorter races are converted to a marathon-equivalent time with Riegel\'s formula, then ranked against real finishers.',
    ranks:[
      ['Tortoise','Testudo perseverans','You will finish. Eventually.'],
      ['Hare','Lepus impatiens','Fast starts, honest regrets.'],
      ['Greyhound','Canis velox','Built to chase things.'],
      ['Horse','Equus fortis','Big engine, no drama.'],
      ['Cheetah','Acinonyx fulminans','Terrifying for exactly this distance.'],
      ['Peregrine Falcon','Falco descendens','You do not run. You descend.']],
    metrics:[
      {k:'r5k',   label:'5K',            hint:'mm:ss',   ref:'marathon', time:true, dist:5000},
      {k:'r10k',  label:'10K',           hint:'mm:ss',   ref:'marathon', time:true, dist:10000},
      {k:'rhalf', label:'Half marathon', hint:'h:mm:ss', ref:'marathon', time:true, dist:21097.5},
      {k:'rfull', label:'Marathon',      hint:'h:mm:ss', ref:'marathon', time:true, dist:42195}]
  }
};
const ORDER = ['fit','strong','fast'];
const TIERS = [0,20,40,62,80,93];
const ART = {Grizzly:'img/animals/grizzly.jpeg',Cheetah:'img/animals/cheetah.jpeg',Sloth:'img/animals/sloth.jpeg'};

/* Every pool is a population that was actually MEASURED. No pool is modelled, and
   none is derived from another — see README section 6.2 for the mixture model that
   was built, tested and rejected for producing impossible numbers. */
const POOLS = {
  everyone:    {name:'Everyone',      who:'the general public',
                desc:'A national fitness survey of the general public — trained or not.'},
  firsttimers: {name:'First-timers',  who:'first-time competitors',
                desc:'People at their first ever meet. Trained alone, then entered once.'},
  competitors: {name:'Competitors',   who:'competitive lifters',
                desc:'Every logged competition lift, novice to world record.'},
  trained:     {name:'Marathoners',   who:'marathon finishers',
                desc:'Everyone who finished the 2025 New York City Marathon.'}
};
function arenaPools(a){ return S.ref?.arenas?.[a]?.pools || []; }

/* DOTS — removes bodyweight and sex bias. Kopayev et al. 2020. */
const DOTS = {
  M:[-307.75076,24.0900756,-0.1918759221,0.0007391293,-0.000001093],
  F:[-57.96288,13.6175032,-0.1126655495,0.0005158568,-0.0000010706]
};
function dotsCoeff(bw, sex){
  const b = Math.min(210, Math.max(40, bw)), c = DOTS[sex] || DOTS.M;
  return 500 / (c[0] + c[1]*b + c[2]*b**2 + c[3]*b**3 + c[4]*b**4);
}

/* ─────────────── state ─────────────── */
const S = {
  arena:'fit', prev:'fit', sex:'M', age:'', bw:'', vals:{},
  pool:'competitors', country:null, q:'', ref:null, countries:[], booted:false
};
const $ = id => document.getElementById(id);
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ─────────────── helpers ─────────────── */
function parseTime(s){
  if(!s) return null;
  const p = String(s).trim().split(':').map(Number);
  if(p.some(isNaN)) return null;
  if(p.length===3) return p[0]*3600+p[1]*60+p[2];
  if(p.length===2) return p[0]*60+p[1];
  if(p.length===1) return p[0]*60;
  return null;
}
function fmtTime(sec){
  const h=Math.floor(sec/3600), m=Math.floor(sec%3600/60), s=Math.round(sec%60);
  const p=n=>String(n).padStart(2,'0');
  return h ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
}
function flagOf(iso){ return String.fromCodePoint(...iso.split('').map(c=>127397+c.charCodeAt(0))); }
function article(w){ return /^[AEIOU]/i.test(w) ? 'an' : 'a'; }
function possessive(n){ return /s$/i.test(n) ? n+"'" : n+"'s"; }
function latinSub(name){
  const s=name.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z]/g,'');
  return s.slice(0,9).replace(/[aeiou]+$/,'')+'ensis';
}
function ageBand(age){
  const bands = (S.ref && S.ref.meta.ageBands) || [];
  for(const b of bands){ const [lo,hi]=b.split('-').map(Number); if(age>=lo&&age<=hi) return b; }
  return 'all';
}
/* linear interpolation onto the empirical curve -> percentile 0..100 */
function pctOf(curve, v){
  const P = S.ref.meta.percentiles, xs = curve.p;
  if(v <= xs[0]) return P[0];
  if(v >= xs[xs.length-1]) return P[P.length-1];
  for(let i=1;i<xs.length;i++){
    if(v <= xs[i]){
      const t = (v - xs[i-1]) / ((xs[i]-xs[i-1]) || 1);
      return P[i-1] + t*(P[i]-P[i-1]);
    }
  }
  return 50;
}
function getCurve(arenaKey, refKey, pool){
  const m = S.ref?.arenas?.[arenaKey]?.metrics?.[refKey];
  const bySex = m?.pools?.[pool]?.[S.sex];
  if(!bySex) return null;
  const age = parseFloat(S.age);
  return bySex[ageBand(isNaN(age)?30:age)] || bySex.all || null;
}
function poolAvailable(arenaKey, pool){
  return ARENAS[arenaKey].metrics.some(m => getCurveAnySex(arenaKey, m.ref, pool));
}
function getCurveAnySex(arenaKey, refKey, pool){
  return S.ref?.arenas?.[arenaKey]?.metrics?.[refKey]?.pools?.[pool];
}

/* ── pool conversion — BUILT, TESTED, REJECTED. Not used for scoring. ──────────
   The idea: treat adults as two strata, people who train (share p, measured by
   NHANES PAQ650) and people who do not, then convert a percentile between them
   with  pct_everyone = (1-p)*100 + p*pct_trained.

   It is mis-specified. p is the share doing vigorous recreational activity (43%
   of men 30-34), but the "trained" curve is built from competitive powerlifters,
   who are ~0.1% of adults. The model therefore assumes 43% of adults are
   distributed like meet competitors, and the output is nonsense: it puts a hard
   floor at the 57th percentile, so an untrained lifter (60/40/80 kg) scored 57%
   while someone lifting more than twice that scored 60%. Inverted, it drove every
   below-median person to 1%.

   The honest reading: the population has three strata — untrained, trains but
   never competes, competes — and the middle one, where nearly every real user
   sits, has no public measured distribution. Kept here with the numbers so the
   next person does not rebuild it. See README section 6.2. */
const POOL_MIXTURE_ENABLED = false;
function participationRate(){
  const P = S.ref?.meta?.participation?.[S.sex];
  if(!P) return 0.26;
  const age = parseFloat(S.age);
  return P[ageBand(isNaN(age)?30:age)] ?? P.all ?? 0.26;
}
function convertPct(pct, fromPool, toPool){
  if(fromPool===toPool) return pct;
  const p = Math.min(0.95, Math.max(0.05, participationRate()));
  if(fromPool==='trained' && toPool==='everyone') return (1-p)*100 + p*pct;
  if(fromPool==='everyone' && toPool==='trained') return (pct - (1-p)*100) / p;
  return pct;
}

/* Daniels & Gilbert VDOT. Converts a race time into an oxygen-cost estimate so a
   marathon can be compared against NHANES measured VO2max. Cross-method, see README. */
function vdotFromRace(metres, seconds){
  const t = seconds/60, v = metres/t;
  const vo2 = -4.60 + 0.182258*v + 0.000104*v*v;
  const pct = 0.8 + 0.1894393*Math.exp(-0.012778*t) + 0.2989558*Math.exp(-0.1932605*t);
  return vo2/pct;
}
const RACE_M = { marathon: 42195 };
const MARATHON_M = 42195;

/* Riegel (1981), "Athletic Records and Human Endurance": T2 = T1 * (D2/D1)^1.06.
   Converts any race distance to a marathon-equivalent so 5K/10K/half can be ranked
   against the real NYC finisher distribution. Verified against published
   equivalency tables to within a minute across 5K-half.

   This is deliberately NOT the VDOT bridge rejected above: there, a race time was
   compared against a treadmill-PREDICTED VO2max — two different instruments. Here
   both ends are race performances measured the same way. The remaining caveat is
   that Riegel assumes marathon-appropriate endurance; a pure 5K runner's marathon
   equivalent will flatter them. The UI says so. */
function riegelToMarathon(seconds, metres){
  if(metres === MARATHON_M) return seconds;
  return seconds * Math.pow(MARATHON_M/metres, 1.06);
}

/* DISABLED. Bridging race time -> VDOT -> NHANES compares two incompatible scales:
   NHANES VO2max is predicted from a SUBMAXIMAL treadmill test (biased high), while
   VDOT from a slow marathon is biased low (marathon pace is limited by fuelling, not
   just aerobic ceiling). The result inverts — a 5:00 marathoner scored 17% against
   competitors but 2% against "everyone", which is plainly wrong.
   FAST needs the same participation-weighted mixture as STRONG. See README section 6.1. */
const VO2_BRIDGE = false;

/* ── cohort lookup (revision POIN 2 step 2 / POIN 3) ──────────────────────────
   Finds the like-for-like comparison group for this user — same sex, same age
   band, same bodyweight band where the source records weight — and reports how
   many real people are in it. Percentiles here are in RAW units (kg, seconds,
   reps) so the number shown to the user is directly checkable. */
function bwBandOf(bw){
  const B=[[40,60],[60,70],[70,80],[80,90],[90,100],[100,110],[110,200]];
  for(const [lo,hi] of B) if(bw>=lo && bw<hi) return `${lo}-${hi}`;
  return bw>=110 ? '110-200' : '40-60';
}
function cohortFor(refKey, x){
  const m = S.ref?.arenas?.[S.arena]?.metrics?.[refKey];
  const byAge = m?.cohorts?.[S.sex]; if(!byAge) return null;
  const age = parseFloat(S.age), band = ageBand(isNaN(age)?30:age);
  const cell = byAge[band] || byAge[Object.keys(byAge)[0]]; if(!cell) return null;
  const bw = parseFloat(S.bw);
  let key = 'any', curve = cell.any;
  if(!curve){
    key = bwBandOf(isNaN(bw)?75:bw);
    curve = cell[key];
    if(!curve){                                   // nearest populated weight band
      const keys=Object.keys(cell);
      if(!keys.length) return null;
      const target=parseInt(key,10);
      key = keys.reduce((a,b)=>Math.abs(parseInt(b,10)-target)<Math.abs(parseInt(a,10)-target)?b:a);
      curve = cell[key];
    }
  }
  let pct = pctOf(curve, x);
  const who = `${S.sex==='M'?'men':'women'} aged ${band}` +
              (key==='any' ? '' : `, ${key.replace('-','–')} kg`);
  return {n:curve.n, pct, band, bwBand:key, who};
}
function regionFor(refKey, v){
  const m = S.ref?.arenas?.[S.arena]?.metrics?.[refKey];
  const byAge = m?.regions?.[S.sex]; if(!byAge || !S.region) return null;
  const age = parseFloat(S.age);
  const cell = byAge[ageBand(isNaN(age)?30:age)]; if(!cell) return null;
  const curve = cell[S.region]; if(!curve) return null;
  return {n:curve.n, pct:pctOf(curve, v)};
}
function regionsAvailable(){
  const m = S.ref?.arenas?.[S.arena]?.metrics?.[ARENAS[S.arena].metrics[0].ref];
  const byAge = m?.regions?.[S.sex]; if(!byAge) return [];
  const age = parseFloat(S.age);
  const cell = byAge[ageBand(isNaN(age)?30:age)] || {};
  return Object.keys(cell);
}

/* ─────────────── scoring ─────────────── */
function metricValue(m){
  const raw = S.vals[m.k];
  if(m.time) return parseTime(raw);
  const a = parseFloat(raw);
  if(isNaN(a)) return null;
  if(a<=0 && !m.signed) return null;   // sit-and-reach may be negative
  if(m.load){                              // Epley: weight x reps -> estimated 1RM
    const r = parseInt(S.vals[m.k+'_reps'],10);
    return (!isNaN(r) && r>1) ? a*(1+Math.min(r,12)/30) : a;
  }
  return a;
}
function scoreArena(pool){
  const arena = ARENAS[S.arena], rows=[];
  const bw = parseFloat(S.bw)||75;
  for(const m of arena.metrics){
    const x = metricValue(m); if(x==null) continue;
    const curve = getCurve(S.arena, m.ref, pool); if(!curve) continue;
    const v = (S.arena==='strong') ? x*dotsCoeff(bw, S.sex)
            : (m.dist ? riegelToMarathon(x, m.dist) : x);
    let pct = pctOf(curve, v);
    if(m.time) pct = 100 - pct;             // lower time is better
    const coh = cohortFor(m.ref, m.dist ? riegelToMarathon(x, m.dist) : x);
    const reg = regionFor(m.ref, v);
    if(coh && m.time) coh.pct = 100 - coh.pct;
    if(reg && m.time) reg.pct = 100 - reg.pct;
    rows.push({m, x, pct:Math.min(99.4,Math.max(0.6,pct)), n:curve.n, cohort:coh, region:reg});
  }
  if(!rows.length) return null;
  return {rows, overall: rows.reduce((a,r)=>a+r.pct,0)/rows.length,
          n: Math.max(...rows.map(r=>r.n))};
}
function tierOf(p){ let i=0; TIERS.forEach((t,n)=>{ if(p>=t) i=n; }); return i; }

function result(){
  const r = scoreArena(S.pool); if(!r) return null;
  const arena = ARENAS[S.arena], tier = tierOf(r.overall);
  const rank = arena.ranks[tier];
  const other = arenaPools(S.arena).find(p => p!==S.pool);
  const o = other ? scoreArena(other) : null;
  const cname = S.country ? S.country.name : null;
  return {...r, arena, tier, rank, pool:S.pool,
    animal: rank[0],
    binomial: rank[1] + (cname ? `, subsp. ${latinSub(cname)}` : ''),
    tagline: rank[2],
    title: cname ? `${possessive(cname)} ${rank[0]}` : `The ${rank[0]}`,
    otherPool: other, otherAnimal: o ? arena.ranks[tierOf(o.overall)][0] : null,
    next: tier<5 ? arena.ranks[tier+1] : null};
}

/* ── narrative layer (revision POIN 3) ────────────────────────────────────────
   The revision is explicit that a chart alone is not an answer. Every number the
   site shows must say which dataset it came from, how many real people it was
   measured against, and what it means in words. */
function bandWord(p){
  if(p>=93) return 'exceptional';
  if(p>=80) return 'well above average';
  if(p>=62) return 'above average';
  if(p>=40) return 'about average';
  if(p>=20) return 'below average';
  return 'well below average';
}
function metricSentence(row, pool){
  const p = Math.round(row.pct), who = POOLS[pool].who;
  const val = row.m.time ? fmtTime(row.x)
            : row.m.load ? Math.round(row.x)+' kg (estimated 1RM)'
            : Math.round(row.x)+(row.m.ref==='jump'||row.m.ref==='reach'?' cm':' reps');
  const beat = row.m.time ? 'faster than' : 'above';
  const adj = S.arena==='strong' ? ', adjusted for bodyweight with DOTS' : '';
  let conv = '';
  if(row.m.dist && row.m.dist !== 42195){
    conv = ` Converted to a ${fmtTime(riegelToMarathon(row.x, row.m.dist))} marathon-equivalent` +
           ` (Riegel 1981) before ranking.`;
  }
  return `${val} is ${bandWord(p)} — ${beat} ${p}% of ${who} in your sex and age band${adj}.${conv}`;
}
function cohortSentence(row){
  if(!row.cohort) return null;
  const c = Math.round(row.cohort.pct), head = Math.round(row.pct);
  const rk = rankIn(row.cohort.pct, row.cohort.n);
  let s = `Among ${row.cohort.n.toLocaleString()} real ${row.cohort.who}, you would place ` +
          `<b>${fmtRank(rk)}</b> — ${c}${ordinalSuffix(c)} percentile on raw ` +
          `${row.m.time?'time':'numbers'}, no bodyweight adjustment.`;
  // Explain the gap rather than leaving two different numbers side by side.
  if(S.arena==='strong' && Math.abs(c-head) >= 8){
    s += c < head
      ? ` Lower than the ${head}% above because everyone here is your size — DOTS credits you for being lighter, raw kilos do not.`
      : ` Higher than the ${head}% above because you are heavy for this band, which DOTS discounts.`;
  }
  return s;
}
/* ── leaderboard position ─────────────────────────────────────────────────────
   A percentile plus a known sample size gives a real position in that dataset.
   Phrased as "you would place #N of M" — this is a rank inside the reference
   data, not a live leaderboard of site users, and the copy must not imply it is. */
function rankIn(pct, n){
  if(!n) return null;
  const rank = Math.max(1, Math.min(n, Math.round((100 - pct)/100 * n)));
  return {rank, n};
}
function fmtRank(r){
  return `#${r.rank.toLocaleString()} of ${r.n.toLocaleString()}`;
}
function ordinalSuffix(n){ const r=n%100; if(r>=11&&r<=13) return 'th';
  return ({1:'st',2:'nd',3:'rd'}[n%10]||'th'); }

function sourceOf(pool){
  return S.ref?.arenas?.[S.arena]?.source?.[pool]
      || S.ref?.arenas?.[S.arena]?.source?.[S.ref.arenas[S.arena].basePool] || '';
}

/* Why this animal, and not the one above or below it. The revision asks for the
   reason, i.e. which input is carrying the result and which is holding it back. */
function whyThisAnimal(r){
  const sorted=[...r.rows].sort((a,b)=>b.pct-a.pct);
  const best=sorted[0], worst=sorted[sorted.length-1];
  const parts=[];
  parts.push(`You scored ${Math.round(r.overall)} overall, the average of your ` +
             `${r.rows.length} ${r.rows.length===1?'entry':'entries'}. ` +
             `That lands in band ${r.tier+1} of 6, which is ${r.animal}.`);
  if(r.rows.length>1 && Math.round(best.pct)!==Math.round(worst.pct)){
    parts.push(`${best.m.label} is carrying it at ${Math.round(best.pct)}%; ` +
               `${worst.m.label} is holding it back at ${Math.round(worst.pct)}%. ` +
               `Bring ${worst.m.label.toLowerCase()} up and the rank moves.`);
  }
  const [lo,hi]=[TIERS[r.tier], r.tier<5?TIERS[r.tier+1]:100];
  if(r.next) parts.push(`${r.animal} runs from ${lo} to ${hi}. ` +
    `You need ${Math.max(1,Math.ceil(hi-r.overall))} more points for ${r.next[0]}.`);
  return parts;
}

/* ─────────────── rendering ─────────────── */
function setAccent(){ document.documentElement.style.setProperty('--a', ARENAS[S.arena].accent); }

function renderHeroBg(){
  $('heroBg').innerHTML = ORDER.map(k=>{
    const a=ARENAS[k];
    return `<div class="layer${k===S.arena?' on':''}">
      <div class="photo" style="background-image:url(${a.photo});background-position:${a.pos}"></div>
      <div class="tintA" style="background:${a.accent}"></div>
      <div class="tintB" style="background:${a.accent}"></div></div>`;
  }).join('') + '<div class="scrim1"></div><div class="scrim2"></div>';
}
function renderFlip(){
  const cur = ARENAS[S.arena].word, prev = ARENAS[S.prev].word;
  const pad = w => { const d=Math.max(0,6-w.length), l=Math.floor(d/2);
                     return ' '.repeat(l)+w+' '.repeat(d-l); };   // fixed 6-wide board
  const c=pad(cur), p=pad(prev);
  const anim = !reduced() && S.booted;
  $('flipWord').innerHTML =
    `<span class="tiles">` + [...c].map((ch,i)=>`
      <span class="tile">
        <span class="half top"><span>${ch}</span></span>
        <span class="half bot"><span>${p[i]||' '}</span></span>
        ${anim?`<span class="flapA" style="animation-delay:${i*44}ms"><span>${p[i]||' '}</span></span>
        <span class="flapB" style="animation-delay:${i*44+240}ms"><span>${ch}</span></span>`:''}
        <span class="seam"></span>
      </span>`).join('') + `</span><span class="flip-underline"></span>`;
}
function renderPanels(){
  $('panels').innerHTML = ORDER.map(k=>{
    const a=ARENAS[k];
    return `<button class="panel${k===S.arena?' on':''}" data-arena="${k}">
      <span class="thumb"><i style="background-image:url(${a.photo})"></i><u style="background:${a.accent}"></u></span>
      <span class="cap"><span class="word">${a.word}</span><span class="crop">${a.crop}</span></span>
    </button>`;
  }).join('');
}
function renderFields(){
  const a = ARENAS[S.arena];
  $('arenaName').textContent = a.name;
  $('arenaName2').textContent = a.name;
  const help=$('arenaHelp');
  help.hidden = !a.help; help.textContent = a.help || '';
  $('fields').innerHTML = a.metrics.map((m,i)=>`
    <div class="field" style="animation-delay:${i*60}ms">
      <div class="head"><span class="name">${m.label}</span><span class="hint2">${m.hint}</span></div>
      <div class="inputs${m.load?' two':''}">
        <input type="${m.time?'text':'number'}" inputmode="${m.time?'text':'decimal'}"
               data-k="${m.k}" placeholder="${m.time?(m.dist&&m.dist<=10000?'25:00':'4:15:00'):(m.load?'kg':(m.signed?'cm (may be minus)':'reps'))}"
               value="${S.vals[m.k]??''}">
        ${m.load?`<input type="number" inputmode="numeric" data-k="${m.k}_reps" placeholder="reps"
               value="${S.vals[m.k+'_reps']??''}">`:''}
      </div>
    </div>`).join('');
}
function renderPools(){
  const list = arenaPools(S.arena);
  const wrap = $('pools');
  wrap.style.gridTemplateColumns = `repeat(${Math.min(list.length,3)},1fr)`;
  wrap.innerHTML = list.map(p=>{
    const info = POOLS[p];
    const c = getCurveAnySex(S.arena, ARENAS[S.arena].metrics[0].ref, p);
    const n = c?.[S.sex]?.all?.n;
    return `<button class="pool${p===S.pool?' on':''}" data-pool="${p}">
      <span class="pname">${info.name}</span>
      <span class="pdesc">${info.desc}</span>
      <span class="pn">${n?'measured · n = '+n.toLocaleString():'measured'}</span>
    </button>`;
  }).join('');
  $('poolNote').textContent = list.length>1
    ? 'Both pools are measured populations. Switching changes who you stand next to, not the maths.'
    : 'One measured population for this arena. More pools need data that is not public yet.';
}
/* Region selector. Unlike v4's invented scope factors (country .94 / region .96),
   each region here is an actual measured curve; regions without enough rows for a
   stable curve simply do not appear. */
const REGION_OF = {
  'Southeast Asia':['Indonesia','Malaysia','Singapore','Philippines','Thailand','Vietnam'],
  'East Asia':['Japan','China','Taiwan','South Korea','Hong Kong'],
  'North America':['United States','Canada','Mexico'],
  'Western Europe':['Germany','France','United Kingdom','Finland','Poland','Sweden','Norway',
                    'Netherlands','Spain','Italy','Ireland','Denmark','Belgium','Austria','Czechia'],
  'Eastern Europe':['Russia','Ukraine','Belarus','Kazakhstan','Latvia','Lithuania','Estonia'],
  'Oceania':['Australia','New Zealand']
};
function regionOfCountry(name){
  for(const [r,cs] of Object.entries(REGION_OF)) if(cs.includes(name)) return r;
  return null;
}
function renderRegions(){
  const avail = regionsAvailable();
  const block = $('regionBlock');
  if(!avail.length){ block.hidden = true; S.region = null; return; }
  block.hidden = false;
  if(S.region && !avail.includes(S.region)) S.region = null;
  const m = S.ref.arenas[S.arena].metrics[ARENAS[S.arena].metrics[0].ref];
  const cell = m.regions[S.sex][ageBand(parseFloat(S.age)||30)] || {};
  $('regionNote').textContent =
    `Measured curves for ${avail.length} region${avail.length>1?'s':''} in your sex and age band. ` +
    `Regions without enough data to be stable are not listed.`;
  $('regions').innerHTML = avail.map(r=>`
    <button class="region${r===S.region?' on':''}" data-region="${r}">
      <span class="rgn">${r}</span>
      <span class="rgc">n = ${cell[r].n.toLocaleString()}</span>
    </button>`).join('');
}

function renderSources(){
  if(!S.ref) return;
  const rows=[];
  for(const [ak,a] of Object.entries(S.ref.arenas)){
    for(const [pool,txt] of Object.entries(a.source||{})){
      let n=0;
      for(const m of Object.values(a.metrics))
        for(const sx of Object.values(m.pools?.[pool]||{}))
          if(sx.all) n=Math.max(n,sx.all.n);
      rows.push(`<div class="src"><b>${ARENAS[ak].word}</b><span>${txt}</span><i>${n?'n='+n.toLocaleString():''}</i></div>`);
    }
  }
  $('sources').innerHTML = rows.join('');
  $('srcLine').textContent = 'Measured data · OpenPowerlifting · NHANES · NYRR · KSPO';
}
function validity(){
  const r = scoreArena(S.pool);
  const el=$('validity');
  if(!r){ el.textContent='Enter at least one number.'; return; }
  const names = r.rows.map(x=>x.m.label.toLowerCase()).join(', ');
  el.textContent = `Ranking on ${names} against ${r.n.toLocaleString()} people.`;
}

/* ── country combo ── */
function renderCountryList(){
  const q=S.q.trim().toLowerCase(), box=$('countryList');
  if(!q){ box.hidden=true; return; }
  const m = S.countries.filter(c=>c.name.toLowerCase().includes(q)).slice(0,8);
  box.hidden=false;
  box.innerHTML = m.length ? m.map(c=>`
    <button data-iso="${c.iso}"><span class="flag">${flagOf(c.iso)}</span>
      <span class="cname">${c.name}</span><span class="creg">${c.region}</span></button>`).join('')
    : '<div class="empty">No country by that name.</div>';
}

/* ─────────────── result screen ─────────────── */
let counterTimer=null;
function showResult(){
  const r = result();
  if(!r){ validity(); return; }
  const a=r.arena, top=Math.round(100-r.overall);

  $('resBg').innerHTML =
    `<div class="photo" style="background-image:url(${a.photo})"></div>
     <div class="tint" style="background:${a.accent}"></div><div class="scrim"></div>`;
  $('resArena').textContent = a.name;
  $('rankNo').textContent = `Rank ${String(r.tier+1).padStart(2,'0')} of 06`;
  $('animal').textContent = r.animal;
  $('binomial').textContent = r.binomial;

  const plate=$('plate');
  if(ART[r.animal]){ plate.style.backgroundImage=`url(${ART[r.animal]})`; plate.innerHTML=''; }
  else { plate.style.backgroundImage='none';
    plate.innerHTML=`<div class="slot"><div><div class="l1">Illustration slot</div>
      <div class="l2">${r.animal} to be supplied</div></div></div>`; }

  $('verdictLine').innerHTML =
    `<span class="mut">${a.verb.toUpperCase()}</span> ${Math.round(r.overall)}% <span class="mut">OF ${POOLS[r.pool].who.toUpperCase()}</span>`;
  const headRank = rankIn(r.overall, r.n);
  $('poolCaption').textContent =
    `${POOLS[r.pool].who} · ${r.n.toLocaleString()} people · your sex and age band`;
  $('rankLine').textContent = headRank
    ? `You would place ${fmtRank(headRank)} among ${POOLS[r.pool].who}, same sex and age band`
    : '';
  $('resTitle').textContent = r.title;
  $('tagline').textContent = r.tagline;
  $('ladder').textContent = r.otherAnimal
    ? (r.otherAnimal===r.animal ? `Among ${POOLS[r.otherPool].who}, the same verdict`
                                : `Among ${POOLS[r.otherPool].who}, ${article(r.otherAnimal)} ${r.otherAnimal}`)
    : '';

  const src = sourceOf(r.pool);
  $('breakdown').innerHTML = r.rows.map(row=>{
    const val = row.m.time ? fmtTime(row.x)
              : row.m.load ? Math.round(row.x)+' kg'
              : Math.round(row.x)+(row.m.ref==='jump'||row.m.ref==='reach'?' cm':' reps');
    const coh = cohortSentence(row);
    const rp = row.region ? Math.round(row.region.pct) : 0;
    const rr = row.region ? rankIn(row.region.pct, row.region.n) : null;
    const reg = row.region ? `<div class="expl reg">Within ${S.region}: <b>${fmtRank(rr)}</b> · ${rp}${ordinalSuffix(rp)} percentile, bodyweight-adjusted.</div>` : '';
    return `<div class="row"><div class="top">
        <span class="nm">${row.m.label}</span>
        <span class="vals"><span class="v">${val}</span><span class="p">${Math.round(row.pct)}%</span></span>
      </div><div class="bar"><i data-w="${row.pct}"></i></div>
      <div class="expl">${metricSentence(row, r.pool)}</div>
      ${coh?`<div class="expl coh">${coh}</div>`:''}
      ${reg}
      <div class="expl src">Source: ${src}</div>
    </div>`;
  }).join('');

  // why this animal + the full ladder with the user's position marked
  $('why').innerHTML = whyThisAnimal(r).map(s=>`<p>${s}</p>`).join('');
  $('ladder2').innerHTML = r.arena.ranks.map((rk,i)=>{
    const lo=TIERS[i], hi=i<5?TIERS[i+1]:100;
    return `<div class="rung${i===r.tier?' on':''}">
      <span class="rn">${String(i+1).padStart(2,'0')}</span>
      <span class="ra">${rk[0]}</span>
      <span class="rr">${lo}–${hi}</span>
      ${i===r.tier?`<span class="ryou">you · ${Math.round(r.overall)}</span>`:''}
    </div>`;
  }).join('');

  if(r.next){
    $('nextAnimal').textContent = r.next[0];
    $('nextLine').textContent = r.next[2];
    $('nextAnimal').parentElement.hidden = false;
  } else {
    $('nextAnimal').parentElement.hidden = true;
  }

  $('result').hidden=false;
  document.body.style.overflow='hidden';
  $('result').scrollTop=0;

  // plain timers, not rAF: rAF is throttled to zero in a backgrounded tab, which
  // left the bars at 0 width if the result was opened while the tab was hidden.
  document.querySelectorAll('.bar i')
    .forEach((el,i)=>setTimeout(()=>{ el.style.width=el.dataset.w+'%'; }, 90+i*90));

  clearInterval(counterTimer);
  const el=$('counter');
  if(reduced()){ el.textContent=`TOP ${top}%`; return; }
  const start=performance.now(), dur=1000;
  counterTimer=setInterval(()=>{
    const t=Math.min(1,(performance.now()-start)/dur), e=1-Math.pow(1-t,3);
    el.textContent = `TOP ${Math.round(100-(100-top)*e)}%`;
    if(t>=1) clearInterval(counterTimer);
  },32);
}
function hideResult(){
  clearInterval(counterTimer);
  $('result').hidden=true;
  document.body.style.overflow='';
}

/* ─────────────── arena switching ─────────────── */
function go(next){
  if(next===S.arena) return;
  S.prev=S.arena; S.arena=next; S.vals={};
  if(!arenaPools(S.arena).includes(S.pool)) S.pool = arenaPools(S.arena)[0];
  setAccent(); renderHeroBg(); renderFlip(); renderPanels();
  renderFields(); renderPools(); renderRegions(); validity();
}

/* ─────────────── wiring ─────────────── */
function wire(){
  $('flipWord').addEventListener('click',()=>go(ORDER[(ORDER.indexOf(S.arena)+1)%ORDER.length]));
  $('flipBtn').addEventListener('click',()=>{ $('hint').style.display='none';
    go(ORDER[(ORDER.indexOf(S.arena)+1)%ORDER.length]); });
  $('panels').addEventListener('click',e=>{
    const b=e.target.closest('[data-arena]'); if(b) go(b.dataset.arena); });
  $('regions').addEventListener('click',e=>{
    const b=e.target.closest('[data-region]'); if(!b) return;
    S.region = (S.region===b.dataset.region) ? null : b.dataset.region;
    renderRegions(); validity(); });
  $('pools').addEventListener('click',e=>{
    const b=e.target.closest('[data-pool]');
    if(b && !b.disabled){ S.pool=b.dataset.pool; renderPools(); validity(); } });
  $('sexSeg').addEventListener('click',e=>{
    const b=e.target.closest('[data-sex]'); if(!b) return;
    S.sex=b.dataset.sex;
    [...$('sexSeg').children].forEach(x=>x.classList.toggle('on',x===b));
    renderPools(); renderRegions(); validity(); });
  $('age').addEventListener('input',e=>{ S.age=e.target.value; renderRegions(); validity(); });
  $('bw').addEventListener('input',e=>{ S.bw=e.target.value; validity(); });
  $('fields').addEventListener('input',e=>{
    const k=e.target.dataset.k; if(!k) return;
    S.vals[k]=e.target.value; validity(); });
  $('country').addEventListener('input',e=>{ S.q=e.target.value; renderCountryList(); });
  $('country').addEventListener('focus',()=>renderCountryList());
  $('countryList').addEventListener('click',e=>{
    const b=e.target.closest('[data-iso]'); if(!b) return;
    S.country = S.countries.find(c=>c.iso===b.dataset.iso);
    S.q = S.country.name; $('country').value = S.q;
    $('countryList').hidden=true;
    const r = regionOfCountry(S.country.name);
    if(r && regionsAvailable().includes(r)) S.region = r;
    renderRegions(); validity(); });
  document.addEventListener('click',e=>{
    if(!e.target.closest('.combo')) $('countryList').hidden=true; });
  $('rankMe').addEventListener('click',showResult);
  $('backBtn').addEventListener('click',hideResult);
  document.addEventListener('keydown',e=>{ if(e.key==='Escape' && !$('result').hidden) hideResult(); });
  $('shareBtn').addEventListener('click',async()=>{
    try{ await navigator.clipboard.writeText(location.href);
      $('shareBtn').textContent='Copied'; setTimeout(()=>$('shareBtn').textContent='Copy link',1600);
    }catch{ $('shareBtn').textContent='Copy failed'; } });
  $('dlBtn').addEventListener('click',downloadCard);
}

/* ─────────────── share card ─────────────── */
function downloadCard(){
  const r=result(); if(!r) return;
  const c=$('cardCanvas'), x=c.getContext('2d'), W=1080,H=1350, A=r.arena.accent;
  x.fillStyle='#0B0D10'; x.fillRect(0,0,W,H);
  x.strokeStyle='rgba(242,240,234,.06)'; x.lineWidth=2;
  for(let i=90;i<W;i+=90){ x.beginPath();x.moveTo(i,0);x.lineTo(i,H);x.stroke(); }
  for(let i=90;i<H;i+=90){ x.beginPath();x.moveTo(0,i);x.lineTo(W,i);x.stroke(); }
  x.fillStyle=A; x.fillRect(64,64,54,54);
  x.fillStyle='#F2F0EA'; x.font='800 34px Archivo, sans-serif';
  x.fillText('BEASTINDEX.COM', 140, 104);
  x.fillStyle=A; x.font='800 150px "Saira Condensed", sans-serif';
  x.fillText(`TOP ${Math.round(100-r.overall)}%`, 64, 420);
  x.fillStyle='#F2F0EA'; x.font='800 110px "Saira Condensed", sans-serif';
  x.fillText(r.animal.toUpperCase(), 64, 560);
  x.fillStyle='#C3C7CE'; x.font='italic 40px Newsreader, serif';
  x.fillText(r.binomial, 64, 620);
  x.fillStyle='#8C9098'; x.font='600 30px Archivo, sans-serif';
  x.fillText(`${r.arena.verb.toUpperCase()} ${Math.round(r.overall)}% OF ${POOLS[r.pool].name.toUpperCase()}`, 64, 700);
  let y=820;
  r.rows.forEach(row=>{
    const val = row.m.time?fmtTime(row.x):row.m.load?Math.round(row.x)+' kg':Math.round(row.x)+' reps';
    x.fillStyle='#F2F0EA'; x.font='700 46px "Saira Condensed", sans-serif';
    x.fillText(row.m.label.toUpperCase(), 64, y);
    x.fillStyle='#C3C7CE'; x.textAlign='right'; x.fillText(val, 780, y);
    x.fillStyle=A; x.fillText(Math.round(row.pct)+'%', 1016, y);
    x.textAlign='left';
    x.fillStyle='#1B1D20'; x.fillRect(64,y+18,952,10);
    x.fillStyle=A; x.fillRect(64,y+18,952*row.pct/100,10);
    y+=110;
  });
  x.fillStyle='#4E525A'; x.font='600 24px Archivo, sans-serif';
  x.fillText('Ranked on measured data · beastindex.com', 64, H-70);
  c.toBlob(b=>{
    const u=URL.createObjectURL(b), a=document.createElement('a');
    a.href=u; a.download=`beastindex-${r.animal.toLowerCase().replace(/\s+/g,'-')}.png`;
    a.click(); URL.revokeObjectURL(u);
  });
}

/* ─────────────── boot ─────────────── */
async function boot(){
  const [ref, countries] = await Promise.all([
    fetch('data/reference.json').then(r=>r.json()),
    fetch('data/countries.json').then(r=>r.json())
  ]);
  S.ref=ref; S.countries=countries;
  setAccent(); renderHeroBg(); renderFlip(); renderPanels();
  renderFields(); renderPools(); renderRegions(); renderSources(); validity(); wire();

  if(!reduced()){                       // the design's opening arena cycle
    const seq=['strong','fast','fit'];
    seq.forEach((a,i)=>setTimeout(()=>{ S.booted=true; go(a); }, 400+i*720));
  } else { S.booted=true; }
}
boot();
