import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { GROUPS, UI, PARTS } from "./data.js";

if (new URLSearchParams(location.search).has("embed")) {
  document.documentElement.classList.add("embed");
}

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const view = document.querySelector("#view");
const rail = document.querySelector("#rail");
const filterEl = document.querySelector("#filter");
const card = document.querySelector("#card");
const explodeEl = document.querySelector("#explode");
const toggleExplode = document.querySelector("#toggleExplode");
const langFr = document.querySelector("#langFr");
const langEn = document.querySelector("#langEn");

const state = {
  lang: "fr",
  explode: 0,
  targetExplode: 0,
  selected: null,
  hover: null,
};

const byId = Object.fromEntries(PARTS.map((p) => [p.id, p]));
const nodes = new Map();

function std(color, metal, rough) {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: metal,
    roughness: rough,
    clearcoat: metal > 0.35 ? 0.25 : 0.04,
    clearcoatRoughness: 0.45,
  });
}

const mat = {
  alu: std(0xb7c0c6, 0.55, 0.38),
  alu2: std(0x8d969e, 0.5, 0.42),
  iron: std(0x5a5f64, 0.48, 0.55),
  steel: std(0x9aa0a6, 0.7, 0.28),
  black: std(0x2a2a2c, 0.18, 0.62),
  rubber: std(0x1c1c1c, 0.05, 0.9),
  ceramic: std(0xf2eee4, 0.04, 0.35),
  copper: std(0xb87333, 0.75, 0.35),
  rust: std(0x7a4e38, 0.25, 0.58),
  heat: std(0x6a5360, 0.4, 0.42),
  plastic: std(0x2c2c30, 0.08, 0.55),
  gold: std(0xc4a35a, 0.65, 0.35),
  orange: std(0xd86a1a, 0.12, 0.5),
  filter: std(0x303030, 0.12, 0.7),
  gasket: std(0x3a3530, 0.04, 0.88),
  hose: std(0x2c2c2a, 0.05, 0.82),
};

function tag(root, id) {
  root.userData.partId = id;
  root.traverse((o) => {
    if (o.isMesh) {
      o.userData.partId = id;
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return root;
}

function add(parent, geo, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  parent.add(m);
  return m;
}

const box = (w, h, d) => new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d) * 0.06);
const cyl = (r, h, s = 20) => new THREE.CylinderGeometry(r, r, h, s);
const cyl2 = (rt, rb, h, s = 16) => new THREE.CylinderGeometry(rt, rb, h, s);
const CX = [-0.84, -0.28, 0.28, 0.84];
const HALF_PI = Math.PI / 2;

function beltPath(cx, cy, r1, r2, gap, thick = 0.035) {
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const a = Math.PI * 0.15 + (Math.PI * 1.7 * i) / 24;
    pts.push(new THREE.Vector3(cx, cy + Math.sin(a) * r1, Math.cos(a) * r1));
  }
  for (let i = 0; i <= 24; i++) {
    const a = -Math.PI * 0.15 - (Math.PI * 1.7 * i) / 24;
    pts.push(new THREE.Vector3(cx, cy - gap + Math.sin(a) * r2, Math.cos(a) * r2));
  }
  const curve = new THREE.CatmullRomCurve3(pts, true);
  return new THREE.TubeGeometry(curve, 80, thick, 8, true);
}

function buildEngine() {
  const root = new THREE.Group();
  const put = (id, group) => {
    tag(group, id);
    group.userData.rest = group.position.clone();
    const spec = byId[id];
    group.userData.explode = new THREE.Vector3(...spec.explode);
    nodes.set(id, group);
    root.add(group);
  };

  const bloc = new THREE.Group();
  add(bloc, box(2.2, 1.02, 1.22), mat.iron);
  add(bloc, box(2.05, 0.22, 1.32), mat.iron, 0, 0.12, 0);
  for (const x of [-1.05, 1.05]) add(bloc, box(0.12, 0.7, 1.05), mat.iron, x, -0.05, 0);
  for (const x of CX) add(bloc, cyl(0.23, 0.85, 18), mat.alu2, x, 0.12, 0);
  put("bloc-cylindres", bloc);

  const head = new THREE.Group();
  head.position.y = 0.72;
  add(head, box(2.2, 0.42, 1.22), mat.alu);
  add(head, box(2.05, 0.16, 0.7), mat.alu2, 0, 0.12, -0.12);
  put("culasse", head);

  const gasket = new THREE.Group();
  gasket.position.y = 0.51;
  add(gasket, box(2.18, 0.035, 1.2), mat.gasket);
  put("joint-culasse", gasket);

  const cover = new THREE.Group();
  cover.position.y = 1.02;
  add(cover, box(2.05, 0.18, 1.02), mat.black);
  add(cover, cyl2(0.07, 0.09, 0.08, 12), mat.black, -0.7, 0.12, 0);
  put("couvre-culasse", cover);

  const timingCover = new THREE.Group();
  timingCover.position.set(1.28, 0.15, 0);
  add(timingCover, box(0.16, 1.55, 1.15), mat.plastic);
  put("carter-distribution", timingCover);

  const pan = new THREE.Group();
  pan.position.y = -0.72;
  add(pan, box(1.95, 0.38, 1.02), mat.steel);
  add(pan, cyl2(0.07, 0.07, 0.08, 12), mat.steel, 0.7, -0.22, 0.2, HALF_PI, 0, 0);
  put("carter-huile", pan);

  const pistons = new THREE.Group();
  for (const x of CX) {
    add(pistons, cyl(0.21, 0.22, 16), mat.alu, x, 0.18, 0);
    add(pistons, cyl(0.22, 0.06, 16), mat.steel, x, 0.08, 0);
  }
  put("pistons", pistons);

  const rods = new THREE.Group();
  for (const x of CX) {
    add(rods, box(0.08, 0.55, 0.12), mat.steel, x, -0.18, 0);
    add(rods, cyl(0.1, 0.1, 12), mat.steel, x, -0.48, 0, 0, 0, HALF_PI);
  }
  put("bielles", rods);

  const crank = new THREE.Group();
  crank.position.y = -0.42;
  add(crank, cyl(0.09, 2.35, 20), mat.steel, 0, 0, 0, 0, 0, HALF_PI);
  for (const x of CX) add(crank, cyl(0.16, 0.16, 12), mat.steel, x, 0, 0.08, 0, 0, HALF_PI);
  for (const x of [-1.05, -0.56, 0, 0.56, 1.05]) add(crank, cyl(0.18, 0.08, 14), mat.steel, x, 0, 0, 0, 0, HALF_PI);
  put("vilebrequin", crank);

  const fly = new THREE.Group();
  fly.position.set(-1.28, -0.42, 0);
  add(fly, cyl(0.52, 0.1, 28), mat.iron, 0, 0, 0, 0, 0, HALF_PI);
  add(fly, cyl(0.58, 0.04, 36), mat.steel, -0.07, 0, 0, 0, 0, HALF_PI);
  put("volant-moteur", fly);

  const damper = new THREE.Group();
  damper.position.set(1.22, -0.42, 0);
  add(damper, cyl(0.28, 0.1, 20), mat.steel, 0, 0, 0, 0, 0, HALF_PI);
  add(damper, cyl(0.18, 0.12, 16), mat.black, 0.08, 0, 0, 0, 0, HALF_PI);
  put("poulie-vilebrequin", damper);

  const cam = new THREE.Group();
  cam.position.set(0, 0.78, -0.18);
  add(cam, cyl(0.055, 2.15, 16), mat.steel, 0, 0, 0, 0, 0, HALF_PI);
  for (const x of CX) {
    add(cam, cyl(0.09, 0.08, 12), mat.steel, x - 0.1, 0, 0.02, 0, 0, HALF_PI);
    add(cam, cyl(0.09, 0.08, 12), mat.steel, x + 0.1, 0, 0.02, 0, 0, HALF_PI);
  }
  put("arbre-cames", cam);

  const valves = new THREE.Group();
  for (const x of CX) {
    add(valves, cyl2(0.05, 0.018, 0.38, 10), mat.steel, x - 0.1, 0.58, 0.16);
    add(valves, cyl2(0.05, 0.018, 0.38, 10), mat.heat, x + 0.1, 0.58, -0.16);
  }
  put("soupapes", valves);

  const springs = new THREE.Group();
  for (const x of CX) {
    add(springs, cyl(0.04, 0.12, 10), mat.steel, x - 0.1, 0.9, 0.16);
    add(springs, cyl(0.04, 0.12, 10), mat.steel, x + 0.1, 0.9, -0.16);
  }
  put("ressorts-soupapes", springs);

  const pulleys = new THREE.Group();
  add(pulleys, cyl(0.2, 0.08, 22), mat.steel, 1.18, -0.42, 0, 0, 0, HALF_PI);
  add(pulleys, cyl(0.22, 0.08, 22), mat.steel, 1.18, 0.78, -0.18, 0, 0, HALF_PI);
  put("poulies-distribution", pulleys);

  const timingBelt = new THREE.Group();
  const tb = new THREE.Mesh(cyl(0.01, 0.01), mat.rubber);
  const shape = [];
  const top = new THREE.Vector3(1.2, 0.78, -0.18);
  const bot = new THREE.Vector3(1.2, -0.42, 0);
  for (let i = 0; i <= 32; i++) {
    const t = i / 32;
    const a = t * Math.PI * 2;
    const ry = 0.62 + Math.cos(a) * 0.02;
    const y = (top.y + bot.y) / 2 + Math.sin(a) * 0.62;
    const z = (top.z + bot.z) / 2 + Math.cos(a) * 0.12;
    shape.push(new THREE.Vector3(1.2, y, z));
  }
  const curve = new THREE.CatmullRomCurve3(shape, true);
  const beltMesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 96, 0.03, 8, true), mat.rubber);
  timingBelt.add(beltMesh);
  tb.visible = false;
  timingBelt.add(tb);
  put("courroie-distribution", timingBelt);

  const tensioner = new THREE.Group();
  tensioner.position.set(1.18, 0.18, 0.22);
  add(tensioner, cyl(0.09, 0.07, 16), mat.black, 0, 0, 0, 0, 0, HALF_PI);
  add(tensioner, cyl(0.04, 0.08, 10), mat.steel, 0, 0, 0, 0, 0, HALF_PI);
  put("galet-tendeur", tensioner);

  const oilPump = new THREE.Group();
  oilPump.position.set(0.55, -0.62, 0.35);
  add(oilPump, box(0.32, 0.22, 0.28), mat.iron);
  add(oilPump, cyl(0.06, 0.2, 10), mat.steel, 0, -0.18, 0.05);
  put("pompe-huile", oilPump);

  const oilFilter = new THREE.Group();
  oilFilter.position.set(0.25, -0.35, 0.72);
  add(oilFilter, cyl(0.12, 0.32, 18), mat.filter, 0, 0, 0, HALF_PI, 0, 0);
  add(oilFilter, cyl(0.13, 0.04, 16), mat.steel, 0, 0, 0.16, HALF_PI, 0, 0);
  put("filtre-huile", oilFilter);

  const dip = new THREE.Group();
  dip.position.set(0.85, 0.15, 0.62);
  add(dip, cyl(0.012, 0.9, 8), mat.steel, 0, 0.2, 0, 0.25, 0, 0);
  add(dip, box(0.05, 0.08, 0.02), mat.orange, 0, 0.68, 0.08);
  put("jauge-huile", dip);

  const plugs = new THREE.Group();
  for (const x of CX) {
    add(plugs, cyl(0.028, 0.22, 10), mat.ceramic, x, 1.08, 0.02);
    add(plugs, cyl(0.035, 0.06, 8), mat.steel, x, 0.96, 0.02);
    add(plugs, cyl(0.01, 0.05, 8), mat.copper, x, 1.2, 0.02);
  }
  put("bougies", plugs);

  const coils = new THREE.Group();
  for (const x of CX) add(coils, box(0.12, 0.28, 0.12), mat.plastic, x, 1.32, 0.02);
  put("bobines", coils);

  const injectors = new THREE.Group();
  for (const x of CX) {
    add(injectors, cyl(0.028, 0.22, 10), mat.steel, x, 0.72, 0.58, 0.7, 0, 0);
    add(injectors, box(0.06, 0.08, 0.05), mat.plastic, x, 0.84, 0.68);
  }
  put("injecteurs", injectors);

  const rail = new THREE.Group();
  rail.position.set(0, 0.88, 0.72);
  add(rail, cyl(0.035, 2.05, 12), mat.steel, 0, 0, 0, 0, 0, HALF_PI);
  put("rampe-injection", rail);

  const intake = new THREE.Group();
  intake.position.set(0, 0.7, 0.72);
  add(intake, box(2.05, 0.28, 0.42), mat.plastic);
  for (const x of CX) add(intake, cyl(0.09, 0.28, 12), mat.plastic, x, 0, -0.28, HALF_PI, 0, 0);
  put("collecteur-admission", intake);

  const throttle = new THREE.Group();
  throttle.position.set(0, 0.72, 1.12);
  add(throttle, cyl(0.14, 0.16, 16), mat.alu, 0, 0, 0, HALF_PI, 0, 0);
  add(throttle, box(0.18, 0.12, 0.08), mat.plastic, 0, 0.12, 0);
  put("boitier-papillon", throttle);

  const exhaust = new THREE.Group();
  exhaust.position.set(0, 0.55, -0.72);
  add(exhaust, box(2.0, 0.18, 0.22), mat.rust);
  for (const x of CX) add(exhaust, cyl(0.07, 0.28, 10), mat.heat, x, 0.05, 0.22, HALF_PI, 0, 0);
  add(exhaust, cyl2(0.09, 0.12, 0.35, 12), mat.rust, 0.2, -0.05, -0.25, HALF_PI, 0, 0);
  put("collecteur-echappement", exhaust);

  const lambda = new THREE.Group();
  lambda.position.set(0.28, 0.42, -1.05);
  add(lambda, cyl(0.025, 0.16, 10), mat.steel, 0, 0, 0, 0.9, 0, 0);
  add(lambda, box(0.06, 0.08, 0.04), mat.gold, 0, 0.12, -0.04);
  put("sonde-lambda", lambda);

  const turbo = new THREE.Group();
  turbo.position.set(0.55, 0.28, -1.15);
  add(turbo, cyl(0.18, 0.12, 18), mat.heat, 0, 0, 0, HALF_PI, 0, 0);
  add(turbo, cyl(0.14, 0.1, 16), mat.alu, 0.16, 0.02, 0.12, HALF_PI, 0.4, 0);
  add(turbo, cyl2(0.05, 0.08, 0.2, 10), mat.iron, -0.05, -0.12, 0);
  put("turbo", turbo);

  const waterPump = new THREE.Group();
  waterPump.position.set(1.05, 0.05, 0.42);
  add(waterPump, cyl(0.14, 0.12, 16), mat.alu, 0, 0, 0, 0, 0, HALF_PI);
  add(waterPump, cyl(0.16, 0.04, 16), mat.black, 0.08, 0, 0, 0, 0, HALF_PI);
  put("pompe-eau", waterPump);

  const thermo = new THREE.Group();
  thermo.position.set(0.7, 0.62, 0.62);
  add(thermo, box(0.22, 0.16, 0.18), mat.alu);
  add(thermo, cyl(0.05, 0.08, 10), mat.copper, 0, 0.02, 0.08, HALF_PI, 0, 0);
  put("thermostat", thermo);

  const hose = new THREE.Group();
  hose.position.set(0.7, 0.78, 0.82);
  const hoseCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.05, 0.12, 0.18),
    new THREE.Vector3(0.02, 0.08, 0.38),
  ]);
  hose.add(new THREE.Mesh(new THREE.TubeGeometry(hoseCurve, 16, 0.04, 8, false), mat.hose));
  put("durite-refroidissement", hose);

  const starter = new THREE.Group();
  starter.position.set(-1.15, -0.55, 0.48);
  add(starter, cyl(0.12, 0.38, 16), mat.black, 0, 0, 0, 0, 0, HALF_PI);
  add(starter, cyl(0.07, 0.16, 12), mat.steel, 0.22, 0.08, -0.12, 0.6, 0, 0);
  put("demarreur", starter);

  const alt = new THREE.Group();
  alt.position.set(1.05, 0.55, 0.58);
  add(alt, cyl(0.16, 0.22, 16), mat.alu, 0, 0, 0, 0, 0, HALF_PI);
  add(alt, cyl(0.14, 0.05, 12), mat.black, 0.12, 0, 0, 0, 0, HALF_PI);
  put("alternateur", alt);

  const serp = new THREE.Group();
  const serpPts = [];
  for (let i = 0; i <= 40; i++) {
    const t = (i / 40) * Math.PI * 2;
    serpPts.push(new THREE.Vector3(1.22, 0.1 + Math.sin(t) * 0.48, 0.28 + Math.cos(t) * 0.32));
  }
  serp.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(serpPts, true), 80, 0.025, 8, true), mat.rubber));
  put("courroie-accessoires", serp);

  const idler = new THREE.Group();
  idler.position.set(1.12, 0.32, 0.52);
  add(idler, cyl(0.08, 0.06, 14), mat.black, 0, 0, 0, 0, 0, HALF_PI);
  put("galet-accessoires", idler);

  const ckp = new THREE.Group();
  ckp.position.set(-1.05, -0.55, -0.38);
  add(ckp, box(0.08, 0.06, 0.16), mat.plastic);
  add(ckp, cyl(0.015, 0.1, 8), mat.steel, 0, 0, 0.08, HALF_PI, 0, 0);
  put("capteur-pmh", ckp);

  const cmp = new THREE.Group();
  cmp.position.set(1.05, 0.9, -0.35);
  add(cmp, box(0.08, 0.06, 0.14), mat.plastic);
  add(cmp, cyl(0.015, 0.08, 8), mat.steel, 0, 0, 0.06, HALF_PI, 0, 0);
  put("capteur-arbre-cames", cmp);

  const ect = new THREE.Group();
  ect.position.set(-0.75, 0.72, 0.55);
  add(ect, cyl(0.03, 0.1, 10), mat.gold, 0, 0, 0, 0.5, 0, 0);
  add(ect, box(0.06, 0.05, 0.04), mat.plastic, 0, 0.08, 0.04);
  put("capteur-temperature", ect);

  const ops = new THREE.Group();
  ops.position.set(-0.45, -0.22, 0.68);
  add(ops, cyl(0.03, 0.1, 10), mat.gold, 0, 0, 0, HALF_PI, 0, 0);
  add(ops, box(0.06, 0.05, 0.04), mat.plastic, 0, 0.02, 0.08);
  put("capteur-pression-huile", ops);

  return root;
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xece8e1);

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 40);
camera.position.set(3.1, 1.55, 3.8);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
view.appendChild(renderer.domElement);
document.getElementById("boot")?.remove();

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.target.set(0, 0.25, 0);
controls.maxDistance = 6.5;
controls.minDistance = 2.6;
controls.maxPolarAngle = Math.PI * 0.48;
controls.minPolarAngle = Math.PI * 0.18;

scene.add(new THREE.HemisphereLight(0xf2eee6, 0xc4bdb2, 0.55));
const key = new THREE.DirectionalLight(0xfff6ea, 1.05);
key.position.set(2.6, 5.5, 3.2);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
scene.add(key);
const rim = new THREE.DirectionalLight(0xd9e2ea, 0.35);
rim.position.set(-3.5, 1.8, -2.5);
scene.add(rim);

const floor = new THREE.Mesh(new THREE.CircleGeometry(5.5, 64), new THREE.MeshStandardMaterial({
  color: 0xe4dfd6,
  metalness: 0.04,
  roughness: 0.92,
}));
floor.rotation.x = -HALF_PI;
floor.position.y = -2.2;
floor.receiveShadow = true;
scene.add(floor);

const engine = buildEngine();
scene.add(engine);

const missing = PARTS.filter((p) => !nodes.has(p.id)).map((p) => p.id);
if (missing.length) console.error("Missing meshes", missing);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function resize() {
  const w = view.clientWidth;
  const h = view.clientHeight;
  camera.aspect = w / Math.max(h, 1);
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
new ResizeObserver(resize).observe(view);
resize();

function copyOf(id) {
  return byId[id][state.lang];
}

function tint(id, hover, selected) {
  const g = nodes.get(id);
  if (!g) return;
  g.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    if (!o.userData._baseEmissive) {
      o.material = o.material.clone();
      o.userData._baseEmissive = o.material.emissive.clone();
    }
    if (selected) o.material.emissive.setHex(0x3a1c0c);
    else if (hover) o.material.emissive.setHex(0x24160c);
    else o.material.emissive.copy(o.userData._baseEmissive);
  });
}

function renderCard() {
  const ui = UI[state.lang];
  if (!state.selected) {
    card.innerHTML = `<p class="kicker">${ui.emptyAka}</p><h1>${ui.emptyTitle}</h1><p class="empty">${ui.empty}</p><p class="empty">${ui.note}</p>`;
    return;
  }
  const c = copyOf(state.selected);
  card.innerHTML = `
    <p class="kicker">${GROUPS[byId[state.selected].group][state.lang]}</p>
    <h1>${c.name}</h1>
    <p class="aka">${c.aka}</p>
    <div class="block"><h3>${ui.role}</h3><p>${c.role}</p></div>
    <div class="block"><h3>${ui.where}</h3><p>${c.where}</p></div>
    <div class="block"><h3>${ui.symptom}</h3><p>${c.symptom}</p></div>
    <p class="empty">${ui.note}</p>`;
}

function renderRail() {
  const ui = UI[state.lang];
  filterEl.placeholder = ui.filter;
  rail.querySelectorAll(".part, .group-label").forEach((n) => n.remove());
  const q = (filterEl.value || "").trim().toLowerCase();
  for (const group of Object.keys(GROUPS)) {
    const items = PARTS.filter((p) => p.group === group).filter((p) => {
      const c = p[state.lang];
      const hay = `${c.name} ${c.aka} ${p.id}`.toLowerCase();
      return !q || hay.includes(q);
    });
    if (!items.length) continue;
    const h = document.createElement("div");
    h.className = "group-label";
    h.textContent = GROUPS[group][state.lang];
    rail.appendChild(h);
    for (const p of items) {
      const c = p[state.lang];
      const n = PARTS.indexOf(p) + 1;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "part";
      b.dataset.id = p.id;
      b.setAttribute("aria-current", state.selected === p.id ? "true" : "false");
      b.innerHTML = `<span class="n">${String(n).padStart(2, "0")}</span><span>${c.name}</span>`;
      b.addEventListener("click", () => select(p.id));
      rail.appendChild(b);
    }
  }
}

function select(id) {
  const prev = state.selected;
  state.selected = id === state.selected ? null : id;
  if (prev) tint(prev, state.hover === prev, false);
  if (state.selected) tint(state.selected, false, true);
  renderCard();
  renderRail();
}

function applyExplode(t) {
  for (const [id, g] of nodes) {
    const rest = g.userData.rest;
    const ex = g.userData.explode;
    g.position.set(rest.x + ex.x * t, rest.y + ex.y * t, rest.z + ex.z * t);
  }
}

function hitList(ev) {
  const r = renderer.domElement.getBoundingClientRect();
  pointer.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
  pointer.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(engine.children, true);
  for (const h of hits) {
    if (h.object.userData.partId) return h.object.userData.partId;
  }
  return null;
}

renderer.domElement.addEventListener("pointermove", (ev) => {
  const id = hitList(ev);
  if (id === state.hover) return;
  if (state.hover && state.hover !== state.selected) tint(state.hover, false, false);
  state.hover = id;
  if (id && id !== state.selected) tint(id, true, false);
  renderer.domElement.style.cursor = id ? "pointer" : "grab";
});

renderer.domElement.addEventListener("click", (ev) => {
  const id = hitList(ev);
  if (id) select(id);
});

function syncChrome() {
  const ui = UI[state.lang];
  document.documentElement.lang = state.lang;
  document.querySelector("#hint").textContent = ui.hint;
  document.querySelector("#explodeLabel").textContent = ui.explode;
  document.querySelector("#subtitle").textContent = ui.subtitle;
  toggleExplode.textContent = state.targetExplode > 0.5 ? ui.assembleBtn : ui.explodeBtn;
  langFr.setAttribute("aria-pressed", state.lang === "fr" ? "true" : "false");
  langEn.setAttribute("aria-pressed", state.lang === "en" ? "true" : "false");
  renderCard();
  renderRail();
}

explodeEl.addEventListener("input", () => {
  state.targetExplode = Number(explodeEl.value) / 100;
  toggleExplode.textContent = state.targetExplode > 0.5 ? UI[state.lang].assembleBtn : UI[state.lang].explodeBtn;
});
toggleExplode.addEventListener("click", () => {
  state.targetExplode = state.targetExplode > 0.4 ? 0 : 0.92;
  explodeEl.value = String(Math.round(state.targetExplode * 100));
  toggleExplode.textContent = state.targetExplode > 0.5 ? UI[state.lang].assembleBtn : UI[state.lang].explodeBtn;
});
langFr.addEventListener("click", () => { state.lang = "fr"; syncChrome(); });
langEn.addEventListener("click", () => { state.lang = "en"; syncChrome(); });
filterEl.addEventListener("input", renderRail);

function tick() {
  const speed = reduced ? 1 : 0.08;
  state.explode += (state.targetExplode - state.explode) * speed;
  if (Math.abs(state.targetExplode - state.explode) < 0.001) state.explode = state.targetExplode;
  applyExplode(state.explode);
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

syncChrome();
tick();
