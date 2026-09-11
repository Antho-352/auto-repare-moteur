import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { GROUPS, UI, PARTS } from "./data.js";

const bootParams = new URLSearchParams(location.search);
if (bootParams.has("embed")) {
  document.documentElement.classList.add("embed");
}

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const view = document.querySelector("#view");
const rail = document.querySelector("#rail");
const filterEl = document.querySelector("#filter");
const card = document.querySelector("#card");
const explodeEl = document.querySelector("#explode");
const toggleExplode = document.querySelector("#toggleExplode");
const toggleCut = document.querySelector("#toggleCut");
const langFr = document.querySelector("#langFr");
const langEn = document.querySelector("#langEn");

const state = {
  lang: bootParams.get("lang") === "en" ? "en" : "fr",
  explode: 0,
  targetExplode: 0,
  selected: null,
  hover: null,
  cutaway: true,
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
  paint: std(0xc5cdd3, 0.35, 0.32),
  ring: std(0x6a6e72, 0.55, 0.4),
  brass: std(0xb08d4a, 0.7, 0.32),
  boot: std(0x141414, 0.04, 0.85),
  cover: new THREE.MeshPhysicalMaterial({
    color: 0x8a2c16,
    metalness: 0.18,
    roughness: 0.28,
    clearcoat: 0.85,
    clearcoatRoughness: 0.18,
  }),
};
const SHELL = new Set(["bloc-cylindres", "culasse", "couvre-culasse", "carter-distribution", "carter-huile"]);
const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0.06);

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

const box = (w, h, d, r = 0.04) => new RoundedBoxGeometry(w, h, d, 3, Math.min(w, h, d, r));
const cyl = (r, h, s = 28) => new THREE.CylinderGeometry(r, r, h, s);
const cyl2 = (rt, rb, h, s = 24) => new THREE.CylinderGeometry(rt, rb, h, s);
const hex = (r, h) => new THREE.CylinderGeometry(r, r, h, 6);
const CX = [-0.84, -0.28, 0.28, 0.84];
const HALF_PI = Math.PI / 2;

function bolt(parent, x, y, z, r = 0.022, h = 0.036) {
  add(parent, hex(r, h), mat.steel, x, y, z);
}

function hoseTo(parent, pts, r = 0.035, material = mat.hose) {
  parent.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, r, 8, false), material));
}

function toothedPulley(parent, x, y, z, R, thick, teeth, rx = 0, ry = 0, rz = HALF_PI) {
  add(parent, cyl(R, thick, 32), mat.steel, x, y, z, rx, ry, rz);
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    const px = x + Math.cos(a) * (R + 0.012);
    const py = y + Math.sin(a) * (R + 0.012);
    add(parent, box(0.018, 0.022, thick * 0.7, 0.004), mat.steel, px, py, z);
  }
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
  add(bloc, box(2.18, 0.92, 1.18, 0.05), mat.iron);
  add(bloc, box(2.08, 0.28, 1.28, 0.04), mat.iron, 0, 0.38, 0);
  add(bloc, box(2.02, 0.22, 1.08, 0.03), mat.iron, 0, -0.52, 0);
  add(bloc, cyl2(0.42, 0.48, 0.16, 28), mat.iron, -1.18, -0.38, 0, 0, 0, HALF_PI);
  for (const z of [-0.52, 0.52]) {
    for (const y of [-0.18, 0.22]) add(bloc, box(1.85, 0.045, 0.045, 0.01), mat.iron, 0, y, z);
  }
  for (const x of CX) {
    add(bloc, cyl(0.255, 0.08, 28), mat.alu2, x, 0.48, 0);
    add(bloc, cyl(0.22, 0.82, 28), mat.alu2, x, 0.08, 0);
  }
  for (const x of [-0.95, 0.95]) {
    add(bloc, cyl(0.06, 0.02, 16), mat.steel, x, 0.05, 0.6, HALF_PI, 0, 0);
  }
  for (const x of [-0.9, -0.3, 0.3, 0.9]) {
    bolt(bloc, x, 0.52, 0.52);
    bolt(bloc, x, 0.52, -0.52);
  }
  put("bloc-cylindres", bloc);

  const head = new THREE.Group();
  head.position.y = 0.72;
  add(head, box(2.18, 0.4, 1.18, 0.04), mat.alu);
  add(head, box(2.05, 0.18, 0.62, 0.03), mat.paint, 0, 0.14, -0.16);
  for (const x of CX) {
    add(head, cyl(0.09, 0.2, 16), mat.iron, x, -0.02, 0.52, HALF_PI, 0, 0);
    add(head, cyl(0.08, 0.18, 16), mat.heat, x, -0.02, -0.52, HALF_PI, 0, 0);
    add(head, cyl(0.045, 0.22, 16), mat.boot, x, 0.22, 0.02);
  }
  for (const x of [-0.95, -0.35, 0.35, 0.95]) bolt(head, x, 0.22, 0.5);
  put("culasse", head);

  const gasket = new THREE.Group();
  gasket.position.y = 0.51;
  add(gasket, box(2.16, 0.028, 1.16, 0.01), mat.gasket);
  for (const x of CX) add(gasket, cyl(0.24, 0.03, 20), mat.gasket, x, 0, 0);
  put("joint-culasse", gasket);

  const cover = new THREE.Group();
  cover.position.y = 1.04;
  add(cover, box(2.02, 0.16, 0.98, 0.05), mat.cover);
  for (let i = 0; i < 7; i++) add(cover, box(1.7, 0.012, 0.035, 0.004), mat.alu, 0, 0.09, -0.32 + i * 0.1);
  add(cover, cyl2(0.07, 0.09, 0.07, 16), mat.black, -0.72, 0.12, 0);
  add(cover, cyl(0.05, 0.03, 16), mat.orange, -0.72, 0.16, 0);
  for (const x of CX) add(cover, cyl(0.05, 0.08, 14), mat.boot, x, 0.02, 0.02);
  put("couvre-culasse", cover);

  const timingCover = new THREE.Group();
  timingCover.position.set(1.3, 0.18, 0);
  add(timingCover, box(0.14, 1.62, 1.12, 0.04), mat.plastic);
  add(timingCover, cyl(0.42, 0.12, 28), mat.plastic, 0.02, -0.58, 0, 0, 0, HALF_PI);
  add(timingCover, cyl(0.38, 0.12, 28), mat.plastic, 0.02, 0.58, -0.16, 0, 0, HALF_PI);
  bolt(timingCover, 0.08, 0.7, 0.42);
  bolt(timingCover, 0.08, -0.7, 0.42);
  put("carter-distribution", timingCover);

  const pan = new THREE.Group();
  pan.position.y = -0.78;
  add(pan, box(1.92, 0.16, 1.05, 0.03), mat.steel, 0, 0.12, 0);
  add(pan, box(1.55, 0.28, 0.82, 0.04), mat.steel, 0, -0.08, 0);
  add(pan, hex(0.055, 0.07), mat.steel, 0.62, -0.22, 0.18);
  for (const x of [-0.7, 0, 0.7]) bolt(pan, x, 0.2, 0.48);
  put("carter-huile", pan);

  const pistons = new THREE.Group();
  for (const x of CX) {
    add(pistons, cyl(0.205, 0.16, 28), mat.alu, x, 0.22, 0);
    add(pistons, cyl(0.198, 0.2, 28), mat.alu2, x, 0.06, 0);
    add(pistons, cyl(0.212, 0.018, 28), mat.ring, x, 0.26, 0);
    add(pistons, cyl(0.212, 0.014, 28), mat.ring, x, 0.23, 0);
    add(pistons, cyl(0.212, 0.014, 28), mat.ring, x, 0.2, 0);
    add(pistons, cyl(0.05, 0.28, 16), mat.steel, x, 0.08, 0, 0, 0, HALF_PI);
  }
  put("pistons", pistons);

  const rods = new THREE.Group();
  for (const x of CX) {
    add(rods, box(0.055, 0.52, 0.09, 0.01), mat.steel, x, -0.2, 0);
    add(rods, box(0.1, 0.08, 0.14, 0.015), mat.steel, x, 0.08, 0);
    add(rods, box(0.12, 0.1, 0.16, 0.015), mat.steel, x, -0.48, 0);
    add(rods, cyl(0.055, 0.16, 16), mat.steel, x, -0.48, 0, 0, 0, HALF_PI);
  }
  put("bielles", rods);

  const crank = new THREE.Group();
  crank.position.y = -0.42;
  add(crank, cyl(0.08, 2.32, 24), mat.steel, 0, 0, 0, 0, 0, HALF_PI);
  CX.forEach((x, i) => {
    const z = i % 2 === 0 ? 0.11 : -0.11;
    add(crank, cyl(0.095, 0.18, 18), mat.steel, x, 0, z, 0, 0, HALF_PI);
    add(crank, box(0.12, 0.28, 0.08, 0.02), mat.steel, x, z > 0 ? -0.12 : 0.12, 0);
  });
  for (const x of [-1.08, -0.56, 0, 0.56, 1.08]) add(crank, cyl(0.16, 0.07, 20), mat.steel, x, 0, 0, 0, 0, HALF_PI);
  put("vilebrequin", crank);

  const fly = new THREE.Group();
  fly.position.set(-1.3, -0.42, 0);
  add(fly, cyl(0.5, 0.09, 40), mat.iron, 0, 0, 0, 0, 0, HALF_PI);
  add(fly, cyl(0.56, 0.035, 48), mat.steel, -0.06, 0, 0, 0, 0, HALF_PI);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    add(fly, box(0.04, 0.05, 0.03, 0.005), mat.steel, -0.06, Math.sin(a) * 0.53, Math.cos(a) * 0.53);
  }
  put("volant-moteur", fly);

  const damper = new THREE.Group();
  damper.position.set(1.24, -0.42, 0);
  add(damper, cyl(0.26, 0.08, 28), mat.steel, 0, 0, 0, 0, 0, HALF_PI);
  add(damper, cyl(0.2, 0.1, 24), mat.rubber, 0.06, 0, 0, 0, 0, HALF_PI);
  add(damper, cyl(0.14, 0.12, 20), mat.steel, 0.1, 0, 0, 0, 0, HALF_PI);
  put("poulie-vilebrequin", damper);

  const cam = new THREE.Group();
  cam.position.set(0, 0.8, -0.16);
  add(cam, cyl(0.048, 2.12, 20), mat.steel, 0, 0, 0, 0, 0, HALF_PI);
  for (const x of CX) {
    add(cam, cyl(0.085, 0.07, 16), mat.steel, x - 0.1, 0.02, 0.01, 0, 0, HALF_PI);
    add(cam, cyl(0.085, 0.07, 16), mat.steel, x + 0.1, 0.02, 0.01, 0, 0, HALF_PI);
  }
  put("arbre-cames", cam);

  const valves = new THREE.Group();
  for (const x of CX) {
    add(valves, cyl2(0.055, 0.016, 0.42, 16), mat.steel, x - 0.1, 0.58, 0.18);
    add(valves, cyl2(0.055, 0.016, 0.42, 16), mat.heat, x + 0.1, 0.58, -0.18);
  }
  put("soupapes", valves);

  const springs = new THREE.Group();
  for (const x of CX) {
    for (const [dx, dz] of [[-0.1, 0.18], [0.1, -0.18]]) {
      add(springs, cyl(0.038, 0.11, 12), mat.steel, x + dx, 0.9, dz);
      add(springs, cyl(0.042, 0.02, 12), mat.steel, x + dx, 0.96, dz);
      add(springs, cyl(0.042, 0.02, 12), mat.steel, x + dx, 0.84, dz);
    }
  }
  put("ressorts-soupapes", springs);

  const pulleys = new THREE.Group();
  toothedPulley(pulleys, 1.18, -0.42, 0, 0.2, 0.07, 18);
  toothedPulley(pulleys, 1.18, 0.8, -0.16, 0.22, 0.07, 20);
  put("poulies-distribution", pulleys);

  const timingBelt = new THREE.Group();
  const tbPts = [];
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    tbPts.push(new THREE.Vector3(1.2, 0.19 + Math.sin(a) * 0.62, -0.08 + Math.cos(a) * 0.14));
  }
  timingBelt.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(tbPts, true), 96, 0.028, 8, true), mat.rubber));
  put("courroie-distribution", timingBelt);

  const tensioner = new THREE.Group();
  tensioner.position.set(1.18, 0.18, 0.24);
  add(tensioner, cyl(0.095, 0.06, 20), mat.black, 0, 0, 0, 0, 0, HALF_PI);
  add(tensioner, cyl(0.04, 0.08, 12), mat.steel, 0, 0, 0, 0, 0, HALF_PI);
  put("galet-tendeur", tensioner);

  const oilPump = new THREE.Group();
  oilPump.position.set(0.55, -0.62, 0.38);
  add(oilPump, box(0.34, 0.2, 0.3, 0.03), mat.iron);
  add(oilPump, cyl(0.07, 0.22, 16), mat.steel, 0, -0.16, 0.04);
  bolt(oilPump, 0.12, 0.12, 0.12);
  put("pompe-huile", oilPump);

  const oilFilter = new THREE.Group();
  oilFilter.position.set(0.28, -0.32, 0.74);
  add(oilFilter, cyl(0.125, 0.34, 24), mat.filter, 0, 0, 0, HALF_PI, 0, 0);
  add(oilFilter, cyl(0.135, 0.04, 20), mat.steel, 0, 0, 0.17, HALF_PI, 0, 0);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    add(oilFilter, box(0.01, 0.28, 0.01, 0.002), mat.ring, Math.cos(a) * 0.12, Math.sin(a) * 0.12, 0);
  }
  put("filtre-huile", oilFilter);

  const dip = new THREE.Group();
  dip.position.set(0.88, 0.12, 0.62);
  add(dip, cyl(0.01, 0.95, 8), mat.steel, 0, 0.22, 0, 0.28, 0, 0);
  add(dip, box(0.055, 0.09, 0.018, 0.004), mat.orange, 0.02, 0.72, 0.1);
  put("jauge-huile", dip);

  const plugs = new THREE.Group();
  for (const x of CX) {
    add(plugs, hex(0.032, 0.05), mat.steel, x, 0.98, 0.02);
    add(plugs, cyl(0.026, 0.16, 16), mat.ceramic, x, 1.1, 0.02);
    add(plugs, cyl(0.032, 0.012, 12), mat.ceramic, x, 1.05, 0.02);
    add(plugs, cyl(0.032, 0.012, 12), mat.ceramic, x, 1.12, 0.02);
    add(plugs, cyl(0.008, 0.05, 8), mat.copper, x, 1.2, 0.02);
  }
  put("bougies", plugs);

  const coils = new THREE.Group();
  for (const x of CX) {
    add(coils, box(0.11, 0.22, 0.11, 0.02), mat.plastic, x, 1.34, 0.02);
    add(coils, cyl2(0.04, 0.028, 0.12, 12), mat.boot, x, 1.18, 0.02);
  }
  put("bobines", coils);

  const injectors = new THREE.Group();
  for (const x of CX) {
    add(injectors, cyl(0.026, 0.2, 14), mat.steel, x, 0.74, 0.58, 0.65, 0, 0);
    add(injectors, box(0.055, 0.07, 0.045, 0.01), mat.plastic, x, 0.86, 0.68);
  }
  put("injecteurs", injectors);

  const railG = new THREE.Group();
  railG.position.set(0, 0.9, 0.74);
  add(railG, cyl(0.032, 2.02, 16), mat.steel, 0, 0, 0, 0, 0, HALF_PI);
  add(railG, cyl(0.04, 0.06, 12), mat.steel, 1.02, 0, 0, 0, 0, HALF_PI);
  put("rampe-injection", railG);

  const intake = new THREE.Group();
  intake.position.set(0, 0.7, 0.78);
  add(intake, box(1.95, 0.26, 0.38, 0.06), mat.plastic);
  for (const x of CX) {
    hoseTo(intake, [
      new THREE.Vector3(x, 0, -0.12),
      new THREE.Vector3(x, -0.02, -0.28),
      new THREE.Vector3(x, -0.04, -0.42),
    ], 0.055, mat.plastic);
  }
  put("collecteur-admission", intake);

  const throttle = new THREE.Group();
  throttle.position.set(0, 0.74, 1.16);
  add(throttle, cyl(0.145, 0.14, 24), mat.alu, 0, 0, 0, HALF_PI, 0, 0);
  add(throttle, box(0.16, 0.1, 0.07, 0.015), mat.plastic, 0, 0.12, 0);
  add(throttle, cyl(0.12, 0.02, 20), mat.boot, 0, 0, 0.08, HALF_PI, 0, 0);
  put("boitier-papillon", throttle);

  const exhaust = new THREE.Group();
  exhaust.position.set(0, 0.52, -0.7);
  add(exhaust, box(2.02, 0.08, 0.16, 0.02), mat.rust, 0, 0.12, 0.28);
  for (const x of CX) {
    hoseTo(exhaust, [
      new THREE.Vector3(x, 0.12, 0.32),
      new THREE.Vector3(x * 0.55, 0.02, 0.02),
      new THREE.Vector3(0.22, -0.06, -0.38),
      new THREE.Vector3(0.28, -0.1, -0.58),
    ], 0.048, mat.heat);
  }
  add(exhaust, cyl2(0.09, 0.12, 0.22, 16), mat.rust, 0.3, -0.1, -0.68, HALF_PI, 0, 0);
  put("collecteur-echappement", exhaust);

  const lambda = new THREE.Group();
  lambda.position.set(0.32, 0.38, -1.12);
  add(lambda, hex(0.028, 0.05), mat.brass, 0, 0, 0, 0.9, 0, 0);
  add(lambda, cyl(0.02, 0.14, 10), mat.steel, 0, 0.08, -0.04, 0.9, 0, 0);
  add(lambda, box(0.055, 0.07, 0.035, 0.008), mat.gold, 0, 0.14, -0.06);
  put("sonde-lambda", lambda);

  const turbo = new THREE.Group();
  turbo.position.set(0.58, 0.26, -1.22);
  add(turbo, new THREE.TorusGeometry(0.13, 0.055, 12, 24, Math.PI * 1.7), mat.heat, 0, 0, 0, HALF_PI, 0, 0.4);
  add(turbo, cyl(0.1, 0.12, 20), mat.alu, 0.18, 0.04, 0.1, HALF_PI, 0.35, 0);
  add(turbo, cyl(0.08, 0.08, 16), mat.iron, -0.02, -0.1, 0);
  add(turbo, cyl2(0.04, 0.07, 0.14, 12), mat.iron, 0.08, -0.16, -0.04);
  put("turbo", turbo);

  const waterPump = new THREE.Group();
  waterPump.position.set(1.05, 0.06, 0.44);
  add(waterPump, cyl(0.145, 0.1, 24), mat.alu, 0, 0, 0, 0, 0, HALF_PI);
  add(waterPump, cyl(0.16, 0.035, 20), mat.black, 0.07, 0, 0, 0, 0, HALF_PI);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    add(waterPump, box(0.04, 0.08, 0.012, 0.004), mat.alu, 0, Math.sin(a) * 0.08, Math.cos(a) * 0.08);
  }
  put("pompe-eau", waterPump);

  const thermo = new THREE.Group();
  thermo.position.set(0.72, 0.64, 0.64);
  add(thermo, box(0.24, 0.16, 0.2, 0.03), mat.alu);
  add(thermo, cyl(0.048, 0.09, 14), mat.brass, 0, 0.02, 0.1, HALF_PI, 0, 0);
  bolt(thermo, 0.08, 0.1, 0.06);
  put("thermostat", thermo);

  const hose = new THREE.Group();
  hose.position.set(0.72, 0.78, 0.82);
  hoseTo(hose, [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.04, 0.1, 0.16),
    new THREE.Vector3(0.02, 0.06, 0.36),
    new THREE.Vector3(-0.02, 0.02, 0.5),
  ], 0.042);
  put("durite-refroidissement", hose);

  const starter = new THREE.Group();
  starter.position.set(-1.18, -0.52, 0.5);
  add(starter, cyl(0.125, 0.4, 22), mat.black, 0, 0, 0, 0, 0, HALF_PI);
  add(starter, cyl(0.07, 0.14, 16), mat.steel, 0.24, 0.1, -0.1, 0.55, 0, 0);
  add(starter, box(0.16, 0.1, 0.1, 0.02), mat.black, 0.02, 0.12, 0.02);
  put("demarreur", starter);

  const alt = new THREE.Group();
  alt.position.set(1.05, 0.56, 0.6);
  add(alt, cyl(0.155, 0.2, 24), mat.alu, 0, 0, 0, 0, 0, HALF_PI);
  add(alt, cyl(0.13, 0.045, 18), mat.black, 0.12, 0, 0, 0, 0, HALF_PI);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    add(alt, box(0.015, 0.12, 0.04, 0.003), mat.alu, 0, Math.sin(a) * 0.15, Math.cos(a) * 0.15);
  }
  put("alternateur", alt);

  const serp = new THREE.Group();
  const serpPts = [];
  for (let i = 0; i <= 48; i++) {
    const t = (i / 48) * Math.PI * 2;
    serpPts.push(new THREE.Vector3(1.24, 0.08 + Math.sin(t) * 0.5, 0.3 + Math.cos(t) * 0.3));
  }
  serp.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(serpPts, true), 96, 0.022, 8, true), mat.rubber));
  put("courroie-accessoires", serp);

  const idler = new THREE.Group();
  idler.position.set(1.14, 0.34, 0.54);
  add(idler, cyl(0.085, 0.055, 18), mat.black, 0, 0, 0, 0, 0, HALF_PI);
  add(idler, cyl(0.03, 0.07, 12), mat.steel, 0, 0, 0, 0, 0, HALF_PI);
  put("galet-accessoires", idler);

  const ckp = new THREE.Group();
  ckp.position.set(-1.05, -0.52, -0.4);
  add(ckp, box(0.07, 0.05, 0.14, 0.01), mat.plastic);
  add(ckp, cyl(0.012, 0.1, 8), mat.steel, 0, 0, 0.08, HALF_PI, 0, 0);
  put("capteur-pmh", ckp);

  const cmp = new THREE.Group();
  cmp.position.set(1.05, 0.92, -0.34);
  add(cmp, box(0.07, 0.05, 0.13, 0.01), mat.plastic);
  add(cmp, cyl(0.012, 0.08, 8), mat.steel, 0, 0, 0.06, HALF_PI, 0, 0);
  put("capteur-arbre-cames", cmp);

  const ect = new THREE.Group();
  ect.position.set(-0.75, 0.74, 0.56);
  add(ect, hex(0.028, 0.06), mat.brass, 0, 0, 0, 0.5, 0, 0);
  add(ect, box(0.055, 0.045, 0.035, 0.006), mat.plastic, 0, 0.08, 0.04);
  put("capteur-temperature", ect);

  const ops = new THREE.Group();
  ops.position.set(-0.45, -0.2, 0.7);
  add(ops, hex(0.028, 0.06), mat.brass, 0, 0, 0, HALF_PI, 0, 0);
  add(ops, box(0.055, 0.045, 0.035, 0.006), mat.plastic, 0, 0.02, 0.08);
  put("capteur-pression-huile", ops);

  return root;
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf0ece4);

const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 60);
camera.position.set(2.85, 1.28, 3.55);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.localClippingEnabled = true;
view.appendChild(renderer.domElement);
document.getElementById("boot")?.remove();

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
new RGBELoader().load("./studio.hdr", (tex) => {
  const env = pmrem.fromEquirectangular(tex).texture;
  scene.environment = env;
  tex.dispose();
  renderer.toneMappingExposure = 1.08;
});

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.55;
controls.target.set(0, 0.18, 0);
controls.maxDistance = 6.5;
controls.minDistance = 2.4;
controls.maxPolarAngle = Math.PI * 0.49;
controls.minPolarAngle = Math.PI * 0.16;
renderer.domElement.addEventListener("pointerdown", () => {
  controls.autoRotate = false;
});

scene.add(new THREE.HemisphereLight(0xfff7ee, 0xb7aea3, 0.28));
const key = new THREE.DirectionalLight(0xfff4e6, 0.85);
key.position.set(3.2, 6.2, 2.4);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.near = 1;
key.shadow.camera.far = 18;
key.shadow.camera.left = -5;
key.shadow.camera.right = 5;
key.shadow.camera.top = 5;
key.shadow.camera.bottom = -5;
key.shadow.bias = -0.0004;
scene.add(key);
const rim = new THREE.DirectionalLight(0xd7e4f0, 0.45);
rim.position.set(-4.2, 2.2, -2.8);
scene.add(rim);
const fill = new THREE.DirectionalLight(0xfffaf2, 0.22);
fill.position.set(-1.2, 4.5, 4.5);
scene.add(fill);

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(7.5, 72),
  new THREE.MeshStandardMaterial({ color: 0xe9e3d8, metalness: 0.02, roughness: 0.86 })
);
floor.rotation.x = -HALF_PI;
floor.position.y = -2.2;
floor.receiveShadow = true;
scene.add(floor);

const blob = new THREE.Mesh(
  new THREE.CircleGeometry(1.85, 48),
  new THREE.MeshBasicMaterial({ color: 0x2c2822, transparent: true, opacity: 0.16, depthWrite: false })
);
blob.rotation.x = -HALF_PI;
blob.position.y = -2.18;
scene.add(blob);

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

function applyFocus(id) {
  for (const [pid, g] of nodes) {
    const on = !id || pid === id;
    g.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      if (o.userData._focusOp == null) {
        o.userData._focusOp = o.material.opacity;
        o.userData._focusTrans = o.material.transparent;
      }
      if (!id) {
        o.material.opacity = o.userData._focusOp;
        o.material.transparent = o.userData._focusTrans;
        return;
      }
      o.material.transparent = !on;
      o.material.opacity = on ? 1 : 0.07;
      o.material.needsUpdate = true;
    });
  }
}

function applyCutaway(on) {
  state.cutaway = on;
  for (const id of SHELL) {
    const g = nodes.get(id);
    if (!g) continue;
    g.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      if (!o.userData._baseEmissive) {
        o.material = o.material.clone();
        o.userData._baseEmissive = o.material.emissive.clone();
      }
      o.material.clippingPlanes = on ? [clipPlane] : [];
      o.material.clipShadows = on;
      o.material.needsUpdate = true;
    });
  }
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

function select(id, opts = {}) {
  if (!id || !nodes.has(id)) return;
  const prev = state.selected;
  state.selected = !opts.force && id === state.selected ? null : id;
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
  toggleCut.textContent = state.cutaway ? ui.solidBtn : ui.cutBtn;
  toggleCut.setAttribute("aria-pressed", state.cutaway ? "true" : "false");
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
toggleCut.addEventListener("click", () => {
  applyCutaway(!state.cutaway);
  toggleCut.textContent = state.cutaway ? UI[state.lang].solidBtn : UI[state.lang].cutBtn;
  toggleCut.setAttribute("aria-pressed", state.cutaway ? "true" : "false");
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

const bootEl = document.querySelector("#boot");
if (bootEl) bootEl.textContent = UI[state.lang].boot;
syncChrome();
applyCutaway(true);
const params = bootParams;
const bootPart = params.get("part");
if (params.has("focus")) document.documentElement.classList.add("focus-part");
if (bootPart && nodes.has(bootPart)) {
  select(bootPart, { force: true });
  state.targetExplode = params.has("focus") ? 0.55 : 0.42;
  explodeEl.value = String(Math.round(state.targetExplode * 100));
  if (params.has("focus")) applyFocus(bootPart);
}
window.addEventListener("message", (ev) => {
  const data = ev.data || {};
  if (data.lang === "en" || data.lang === "fr") {
    state.lang = data.lang;
    syncChrome();
  }
  const id = data.part;
  if (typeof id === "string" && nodes.has(id)) {
    select(id, { force: true });
    if (document.documentElement.classList.contains("focus-part")) applyFocus(id);
  }
});
tick();

function reportHeight() {
  const el = document.querySelector(".app") || document.body;
  const h = Math.ceil(el.getBoundingClientRect().height + 16);
  if (h > 0) parent.postMessage({ type: "engine-height", height: h }, "*");
}
if (document.documentElement.classList.contains("embed") || new URLSearchParams(location.search).has("embed")) {
  new ResizeObserver(reportHeight).observe(document.documentElement);
  window.addEventListener("load", reportHeight);
  setTimeout(reportHeight, 400);
  setTimeout(reportHeight, 1200);
}
