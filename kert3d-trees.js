/**
 * kert3d-trees.js — eljárásos fa- és épületgenerátor (three.js r184+)
 *
 * Használat Claude Code-ban:
 *
 *   import * as THREE from 'three';
 *   import { MATERIALS, makeTree, makeHouse } from './kert3d-trees.js';
 *
 *   const fa = makeTree('tomor', { h: 13, d: 9 });   // magasság/koronaátmérő METERBEN
 *   fa.position.set(54.8, 0, 1.6);                   // telek-koordináta
 *   scene.add(fa);
 *
 * Típusok: 'tomor' | 'gyurus' | 'hajtogatott' | 'cserje' | 'model' (betöltött GLB-sablon)
 * Minden mesh és minden anyag NEVET kap, így az OBJ/GLB export Blenderben is olvasható.
 * Minden méret méterben, y felfelé, a fa töve y = 0.
 *
 * 'model' típusú fajták (pl. ezüstfenyő): a SPECIES bejegyzés "model" mezője egy GLB-fájl útja.
 * Ezeket a makeSpecies() előtt egyszer be kell töltetni: await preloadSpeciesModels();
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const PALETTE = {
  lomb: '#93AE7B',
  lombArnyek: '#7B9566',
  torzs: '#7A5B3F',
  falazat: '#F6F4F0',
  belso: '#6E6A63',
  talaj: '#D6BC97'
};

export const MATERIALS = {
  lomb: new THREE.MeshStandardMaterial({ name: 'lomb', color: PALETTE.lomb, roughness: 0.92, metalness: 0 }),
  lombArnyek: new THREE.MeshStandardMaterial({ name: 'lomb-arnyek', color: PALETTE.lombArnyek, roughness: 0.92, metalness: 0 }),
  torzs: new THREE.MeshStandardMaterial({ name: 'torzs', color: PALETTE.torzs, roughness: 0.85, metalness: 0 }),
  falazat: new THREE.MeshStandardMaterial({ name: 'falazat', color: PALETTE.falazat, roughness: 0.7, metalness: 0 }),
  belso: new THREE.MeshStandardMaterial({ name: 'belso', color: PALETTE.belso, roughness: 0.8, metalness: 0 })
};

/** Determinisztikus "szobrozás": a gömb csúcsait egy sima zajjal kimozgatja.
 *  Ez adja a kézzel formált, nem-gömb hatást. seed-del fánként más forma. */
function sculpt(geo, amount = 0.16, seed = 1) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n =
      Math.sin((x * 3.1 + seed) * 2.3) *
      Math.cos((y * 2.7 + seed) * 1.9) *
      Math.sin((z * 3.3 + seed) * 2.1);
    const s = 1 + n * amount;
    p.setXYZ(i, x * s, y * s, z * s);
  }
  geo.computeVertexNormals();
  return geo;
}

function trunk(h, r, lean = 0, name = 'torzs') {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.75, r, h, 12), MATERIALS.torzs);
  m.name = name;
  m.position.y = h / 2;
  m.rotation.z = lean;
  return m;
}

/* ---- fatípusok. h = teljes magasság (m), d = koronaátmérő (m) ---- */

function tomor(h, d, seed) {
  const g = new THREE.Group();
  g.add(trunk(h * 0.42, d * 0.055, 0.04));
  const c = new THREE.Mesh(sculpt(new THREE.SphereGeometry(d / 2, 26, 20), 0.16, seed), MATERIALS.lomb);
  c.name = 'lombtomeg';
  c.scale.set(1, (h * 0.62) / d, 0.96);
  c.position.y = h * 0.42 + (h * 0.62) / 2 - h * 0.06;
  g.add(c);
  return g;
}

function gyurus(h, d) {
  const g = new THREE.Group();
  g.add(trunk(h * 0.16, d * 0.05));
  const rings = 14, ch = h * 0.86;
  for (let i = 0; i < rings; i++) {
    const f = i / rings;
    const r = (d / 2) * (1 - f) + 0.02;
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 0.86, r, (ch / rings) * 1.05, 24),
      i % 2 ? MATERIALS.lombArnyek : MATERIALS.lomb
    );
    m.name = 'gyuru-' + (i + 1);
    m.position.y = h * 0.16 + (i + 0.5) * (ch / rings);
    g.add(m);
  }
  return g;
}

function hajtogatott(h, d) {
  const g = new THREE.Group();
  g.add(trunk(h * 0.14, d * 0.05));
  const c = new THREE.Mesh(new THREE.ConeGeometry(d / 2, h * 0.9, 9, 4), MATERIALS.lomb);
  c.name = 'kup';
  c.position.y = h * 0.14 + h * 0.45;
  g.add(c);
  return g;
}

function cserje(h, d, seed) {
  const g = new THREE.Group();
  [[0, 0, 0, 1], [-0.35, -0.1, 0.2, 0.7], [0.3, -0.05, -0.25, 0.62]].forEach(([x, y, z, s], i) => {
    const m = new THREE.Mesh(
      sculpt(new THREE.SphereGeometry((d / 2) * s, 18, 12), 0.2, seed + i),
      i ? MATERIALS.lombArnyek : MATERIALS.lomb
    );
    m.name = 'cserje-' + (i + 1);
    m.scale.set(1, 0.78, 1);
    m.position.set(x * d, h * 0.5 + y * h, z * d);
    g.add(m);
  });
  return g;
}

const BUILDERS = { tomor, gyurus, hajtogatott, cserje };

/**
 * @param {'tomor'|'gyurus'|'hajtogatott'|'cserje'} type
 * @param {{h:number, d:number, seed?:number, name?:string}} opts  h/d METERBEN
 * @returns {THREE.Group} töve az origóban, y = 0
 */
export function makeTree(type, { h, d, seed = 1, name } = {}) {
  const build = BUILDERS[type];
  if (!build) throw new Error('kert3d-trees: ismeretlen fatípus: ' + type);
  const g = build(h, d, seed);
  g.name = name || 'fa-' + type;
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

/** Fajta → forma ajánlás a piliscsabai listához. */
export const SPECIES = {
  'ezustfenyo':        { type: 'model', model: './model/ezustfenyo.glb', h: 12, d: 5, color: '#95ABAC' },
  'szilva':            { type: 'model', model: './model/szilva.glb', h: 6,   d: 5   },
  'korte':             { type: 'model', model: './model/korte.glb',  h: 2.6, d: 2.1 },
  'voros-juhar':       { type: 'tomor',       h: 13,  d: 9   },
  'tatar-juhar':       { type: 'tomor',       h: 6,   d: 6   },
  'diszalma-royalty':  { type: 'tomor',       h: 5,   d: 4.5 },
  'oszlopos-diszalma': { type: 'gyurus',      h: 5,   d: 2.6 },
  'diszcseresznye':    { type: 'model', model: './model/amanogawa.glb', h: 5, d: 1.5 },  // 'Amanogawa' (oszlopos)
  'perzsafa-bokor':    { type: 'cserje',      h: 5,   d: 6   },
  'birs':              { type: 'tomor',       h: 4,   d: 3.5 },
  'som-jolico':        { type: 'tomor',       h: 5,   d: 4   },
  'euonymus':          { type: 'cserje',      h: 1.2, d: 1.2 },

  /* — fajtatervek: valódi exportált GLB-sablonok (fak.md, piliscsabai lista). A szín a modell
     saját, kutatott materialneveiben van besütve (lomb-bordo, lomb-fuge stb.) — itt nincs felülírás. */
  'crimson-snow':          { type: 'model', model: './model/crimson-snow.glb',          h: 13,  d: 9   },  // Vörös juhar 'Crimson King'
  'diszalma-royalty-fa':   { type: 'model', model: './model/diszalma-royalty-fa.glb',    h: 4,   d: 4   },  // Díszalma 'Royalty'
  'berkenye':              { type: 'model', model: './model/berkenye.glb',               h: 3.5, d: 3   },  // Berkenye 'Granatnaja'
  'fuge':                  { type: 'model', model: './model/fuge.glb',                   h: 3.5, d: 4.5 },  // Füge 'Ronde de Bordeaux'
  'perzsafa-bokorfa':      { type: 'model', model: './model/perzsafa-bokorfa.glb',       h: 5,   d: 6   },  // Perzsafa (bokor)
  'naspolya':              { type: 'model', model: './model/naspolya.glb',               h: 4.5, d: 4   },  // Naspolya 'Szentesi rózsa'
  'oszlopos-diszalma-fa':  { type: 'model', model: './model/oszlopos-diszalma-fa.glb',    h: 5,   d: 2.6 },  // Oszlopos díszalma 'Van Eseltine'
  'husos-som':             { type: 'model', model: './model/husos-som.glb',              h: 5,   d: 4   },  // Som 'Jolico'
  'birsalma':              { type: 'model', model: './model/birsalma.glb',               h: 4,   d: 3.5 },  // Birs 'Bereczki'
  'mezalmacska':           { type: 'model', model: './model/mezalmacska.glb',            h: 3.5, d: 3   },  // Mézalmácska 'Smokey'
  'josta':                 { type: 'model', model: './model/josta.glb',                  h: 1.8, d: 1.8 },  // Jósta
  'egres':                 { type: 'model', model: './model/egres.glb',                  h: 1.2, d: 1.2 },  // Egres 'Hinnonmäki Yellow'
  'ribizli':               { type: 'model', model: './model/ribizli.glb',                h: 1.4, d: 1.4 },  // Ribizli
  // Háromerű juhar — négy külön modellel: tavasz / nyár / ősz / tél (csupasz ágváz)
  'acer-buergerianum':     { type: 'model', model: './model/seasons/acer-buergerianum.glb', h: 9, d: 7,
                             seasons: { tavasz: './model/seasons/acer-buergerianum-tavasz.glb',
                                        nyar:   './model/seasons/acer-buergerianum.glb',
                                        osz:    './model/seasons/acer-buergerianum-osz.glb',
                                        tel:    './model/seasons/acer-buergerianum-tel.glb' } },
  'madarbirs':             { type: 'model', model: './model/madarbirs-kaszkad.glb',      h: 1.8, d: 2.8, dz: 1.6 },  // Madárbirs sövény (kaszkád)
  'szolo-kocka':           { type: 'model', model: './model/szolo-kocka.glb',            h: 3.4, d: 5.4, dz: 5.1 }   // Szőlő-kocka a konyha fölé
};

const _speciesMatCache = {};
function speciesFoliageMats(key, color) {
  if (_speciesMatCache[key]) return _speciesMatCache[key];
  const base = new THREE.Color(color);
  const lomb = MATERIALS.lomb.clone(); lomb.color.copy(base); lomb.name = 'lomb-' + key;
  const arn = MATERIALS.lombArnyek.clone(); arn.color.copy(base).multiplyScalar(0.82); arn.name = 'lomb-arnyek-' + key;
  return (_speciesMatCache[key] = { lomb, arn });
}

/* ---- 'model' típus: valódi GLB-ből betöltött, kézzel exportált fasablon (pl. ezüstfenyő) ---- */
const _gltfLoader = new GLTFLoader();
const _modelCache = {};
function loadModel(url) {
  if (_modelCache[url]) return _modelCache[url];
  return (_modelCache[url] = new Promise((resolve, reject) => {
    _gltfLoader.load(url, (gltf) => resolve(gltf.scene), undefined, reject);
  }));
}

/** Előtölti az összes 'model' típusú SPECIES GLB-sablonját, és megméri a nyers (skálázás
 *  előtti) méretét. Hívd meg egyszer, await-tel, a makeSpecies() első használata előtt. */
export async function preloadSpeciesModels() {
  const jobs = [];
  for (const s of Object.values(SPECIES)) {
    if (s.type !== 'model' || s._template) continue;
    jobs.push(loadModel(s.model).then((tpl) => {
      s._template = tpl;
      s._box = new THREE.Box3().setFromObject(tpl);      // a NYÁRI változat a méret-referencia
      s._natural = s._box.getSize(new THREE.Vector3());
    }));
    // évszakos változatok: ugyanazzal a skálával jelennek meg, mint a nyári referencia,
    // különben a csupasz téli ágváz (keskeny) fel lenne fújva a koronaátmérőre
    if (s.seasons) {
      s._seasonTpl = {};
      for (const [nev, url] of Object.entries(s.seasons)) {
        jobs.push(loadModel(url).then((tpl) => { s._seasonTpl[nev] = tpl; }));
      }
    }
  }
  await Promise.all(jobs);
}

/** A GLB-sablon a mi kutatott (SPECIES h/d, fak.md) méretünkre igazodik: a magasság (Y) a
 *  célmagasságra, a szélesség (X és Z KÜLÖN-KÜLÖN) a cél-átmérőre — így a korona-lábnyom
 *  mindig négyzetes (X = Z = d), sosem nyúlik ki aránytalanul egy irányba. */
function fromModel(key, s, h, d, evszak) {
  if (!s._template) throw new Error('kert3d-trees: "' + key + '" modellje nincs előtöltve — hívd meg: await preloadSpeciesModels()');
  const tpl = (evszak && s._seasonTpl && s._seasonTpl[evszak]) || s._template;
  const g = tpl.clone(true);
  g.name = key;
  const n = s._natural;              // mindig a nyári referencia — a csupasz téli ágváz így nem fúvódik fel
  const sy = h / n.y;
  // dz = külön mélység (sövényelem, szőlő-kocka); nélküle a lábnyom négyzetes
  g.scale.set(d / n.x, sy, (s.dz ?? d) / n.z);
  // a modell TÉNYLEGES alját tesszük a csoport origójába — van olyan modell
  // (pl. kaszkád madárbirs), aminek a geometriája az origója alá lóg
  g.position.y = -s._box.min.y * sy;
  if (s.color) {
    const fm = speciesFoliageMats(key, s.color);
    g.traverse((o) => { if (o.isMesh) {
      if (/-arnyek$/.test(o.material.name)) o.material = fm.arn;
      else if (/^lomb-/.test(o.material.name)) o.material = fm.lomb;
      o.castShadow = true; o.receiveShadow = true;
    }});
  }
  return g;
}

/** Egy fajta példánya. h/d METERBEN (kihagyva a SPECIES tábla alapmérete). growth = 0..1 (ültetés → kifejlett). */
export function makeSpecies(key, { growth = 1, seed = 1, h, d, evszak } = {}) {
  const s = SPECIES[key];
  if (!s) throw new Error('kert3d-trees: ismeretlen fajta: ' + key);
  const k = 0.25 + 0.75 * growth;
  const targetH = (h ?? s.h) * k, targetD = (d ?? s.d) * k;
  if (s.type === 'model') return fromModel(key, s, targetH, targetD, evszak);
  const g = makeTree(s.type, { h: targetH, d: targetD, seed, name: key });
  if (s.color) {
    const fm = speciesFoliageMats(key, s.color);
    g.traverse((o) => { if (o.isMesh) {
      if (o.material === MATERIALS.lomb) o.material = fm.lomb;
      else if (o.material === MATERIALS.lombArnyek) o.material = fm.arn;
    }});
  }
  return g;
}

/** Fehér papírtömeg ház: falak + oromtető + sötét nyílás. Méretek méterben. */
export function makeHouse({ w = 8, d = 6, wallH = 3, ridge = 2.6, name = 'haz' } = {}) {
  const g = new THREE.Group();
  g.name = name;
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), MATERIALS.falazat);
  body.name = 'falak';
  body.position.y = wallH / 2;
  g.add(body);

  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 - 0.25, 0);
  shape.lineTo(w / 2 + 0.25, 0);
  shape.lineTo(0, ridge);
  shape.lineTo(-w / 2 - 0.25, 0);
  const roof = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: d + 0.5, bevelEnabled: false }),
    MATERIALS.falazat
  );
  roof.name = 'tetotomeg';
  roof.position.set(0, wallH, -(d + 0.5) / 2);
  g.add(roof);

  const nyilas = new THREE.Mesh(new THREE.BoxGeometry(w * 0.5, wallH * 0.7, 0.12), MATERIALS.belso);
  nyilas.name = 'nyilas';
  nyilas.position.set(0, wallH * 0.42, d / 2 + 0.02);
  g.add(nyilas);

  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
