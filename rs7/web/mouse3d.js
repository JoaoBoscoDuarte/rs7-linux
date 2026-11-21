// 3D view of a user-supplied mouse model (OBJ). The model is NOT bundled: place it at
// ~/.config/rs7-linux/model/mouse.obj (served by the local server). Without it the app keeps the 2D drawing.
import * as THREE from "three";
import { OrbitControls } from "./vendor/OrbitControls.js";
import { RoomEnvironment } from "./vendor/RoomEnvironment.js";
import { OBJLoader } from "./vendor/OBJLoader.js";

const host = document.getElementById("m3d");
const fail = (reason, detail) => { window.Mouse3D = null; window.Mouse3DFail = { reason, detail: detail || "" }; document.dispatchEvent(new Event("mouse3d-fail")); };
async function start() {
  let text;
  try { const r = await fetch("model/mouse.obj"); if (!r.ok) return fail("model", r.status); text = await r.text(); } catch (e) { return fail("error", e.message); }
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } catch (e) { return fail("gl"); }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.8;
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.03).texture; scene.environmentIntensity = 0.6;
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(3, 7, 4); scene.add(key);
  const rim = new THREE.DirectionalLight(0x9db8ff, 1.8); rim.position.set(-5, 3, -5); scene.add(rim);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false; controls.enableDamping = true; controls.dampingFactor = 0.08; controls.autoRotateSpeed = 1.6; controls.maxPolarAngle = Math.PI * 0.62;

  // ---- parse the model: x = length (front = +x), y = up, z = width (left = -z)
  const obj = new OBJLoader().parse(text);
  const tris = []; // {a:[3 vec], n:[3 vec], m:materialName}
  obj.traverse((o) => { if (!o.isMesh) return; const g = o.geometry, P = g.attributes.position, N = g.attributes.normal;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const groups = g.groups.length ? g.groups : [{ start: 0, count: P.count, materialIndex: 0 }];
    for (const gr of groups) for (let i = gr.start; i < gr.start + gr.count; i += 3) {
      const t = { p: [], n: [], m: (mats[gr.materialIndex] || mats[0]).name };
      for (let k = 0; k < 3; k++) { t.p.push(new THREE.Vector3(P.getX(i + k), P.getY(i + k), P.getZ(i + k))); t.n.push(N ? new THREE.Vector3(N.getX(i + k), N.getY(i + k), N.getZ(i + k)) : new THREE.Vector3(0, 1, 0)); }
      t.c = t.p[0].clone().add(t.p[1]).add(t.p[2]).multiplyScalar(1 / 3); tris.push(t); } });
  const box = new THREE.Box3(); tris.forEach((t) => t.p.forEach((v) => box.expandByPoint(v)));
  const size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
  // the supplied model has some inward-facing normals (dark panels): make them all point away from the body core
  const core = new THREE.Vector3(mid.x, box.min.y + 0.2 * size.y, mid.z);
  for (const t of tris) { const out = t.c.clone().sub(core); for (let k = 0; k < 3; k++) if (t.n[k].dot(out) < 0) t.n[k].negate(); }
  const L = size.x, Wd = size.z, Hh = size.y;
  const build = (list, lift = 0, center = null) => { const P = [], Nn = [];
    for (const t of list) for (let k = 0; k < 3; k++) { const v = t.p[k].clone(); if (lift) v.add(t.n[k].clone().multiplyScalar(lift)); if (center) v.sub(center); P.push(v.x, v.y, v.z); Nn.push(t.n[k].x, t.n[k].y, t.n[k].z); }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(Nn, 3)); return g; };
  // recoloured like the white RS7: white shell, light button panels, dark wheel
  const col = { "Material.001": 0xeceff4, "Material.002": 0xd5dae3, "Material.003": 0x2b2f36, "Material.004": 0xbfc6d2, "Material.005": 0xf4f6fa };
  const mat = (name, rough) => new THREE.MeshStandardMaterial({ color: col[name] ?? 0x20232a, roughness: rough, metalness: 0.15, side: THREE.DoubleSide, emissive: 0x000000 });
  const root = new THREE.Group(); root.position.set(-mid.x, -box.min.y, -mid.z); scene.add(root);
  // wheel = its own mesh so it can spin (faces of Material.003)
  const wheelTris = tris.filter((t) => t.m === "Material.003"), rest = tris.filter((t) => t.m !== "Material.003");
  const wc = new THREE.Box3(); wheelTris.forEach((t) => t.p.forEach((v) => wc.expandByPoint(v))); const wcen = wc.getCenter(new THREE.Vector3());
  const byMat = {}; rest.forEach((t) => (byMat[t.m] = byMat[t.m] || []).push(t));
  for (const [m, list] of Object.entries(byMat)) root.add(new THREE.Mesh(build(list), mat(m, m === "Material.005" ? 0.45 : 0.32)));
  const wheel = new THREE.Mesh(build(wheelTris, 0, wcen), mat("Material.003", 0.4)); wheel.position.copy(wcen); root.add(wheel);

  // ---- glow overlays (accent colour), copies of the surface patches
  const parts = {};
  const accent = new THREE.Color(0x0095ff);
  const mkOverlay = (id, geo) => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide })); root.add(m); parts[id] = { mesh: m, glow: 0, target: 0 }; };
  const topPatch = (sgn) => rest.filter((t) => sgn * t.c.z > 0.07 * Wd && t.c.x > mid.x + 0.02 * L && t.c.x < box.max.x - 0.03 * L && t.c.y > box.min.y + 0.42 * Hh && t.n.every((n) => n.y > 0.35));
  mkOverlay("h0", build(topPatch(-1), 0.012)); mkOverlay("h1", build(topPatch(1), 0.012));   // left = -z, right = +z
  // surface lookups for the small buttons
  const solid = new THREE.Mesh(build(tris), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })); root.add(solid); solid.visible = false; root.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  const hitDown = (x, z) => { ray.set(new THREE.Vector3(x, box.max.y + 1, z).applyMatrix4(root.matrixWorld), new THREE.Vector3(0, -1, 0)); const h = ray.intersectObject(solid)[0]; return h ? root.worldToLocal(h.point.clone()) : null; };
  const hitSide = (x, y) => { ray.set(new THREE.Vector3(x, y, box.min.z - 1).applyMatrix4(root.matrixWorld), new THREE.Vector3(0, 0, 1)); const h = ray.intersectObject(solid)[0]; return h ? root.worldToLocal(h.point.clone()) : null; };
  const pill = (id, p, len, rot) => { if (!p) return; const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.045 * L / 3.5, len * L / 3.5, 6, 14), new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0, depthWrite: false }));
    m.position.copy(p); if (rot) m.rotation.set(...rot); root.add(m); parts[id] = { mesh: m, glow: 0, target: 0 }; };
  const dp = hitDown(wcen.x - 0.4 * L / 3.5, 0); if (dp) { dp.y += 0.02; pill("h5", dp, 0.12, [0, 0, Math.PI / 2]); }
  const s4 = hitSide(wcen.x - 0.05, box.min.y + 0.45 * Hh), s3 = hitSide(wcen.x - 0.7 * L / 3.5, box.min.y + 0.42 * Hh);
  if (s4) { s4.z += 0.012; pill("h4", s4, 0.2, [0, 0, Math.PI / 2]); } if (s3) { s3.z += 0.012; pill("h3", s3, 0.2, [0, 0, Math.PI / 2]); }
  parts.h2 = { mesh: wheel, glow: 0, target: 0, base: wheel.material.color.clone() };

  const HOME = new THREE.Vector3(L * 0.55, L * 0.6, L * 0.95).setLength(L * 2.25);
  camera.position.copy(HOME); controls.target.set(0, Hh * 0.35, 0); controls.minDistance = L * 1.2; controls.maxDistance = L * 5;
  let spin = 0;
  function frame() {
    requestAnimationFrame(frame); if (!host.offsetParent) return;
    const cs = getComputedStyle(document.documentElement).getPropertyValue("--acc").trim(); if (cs) accent.set(cs);
    for (const k in parts) { const p = parts[k]; p.glow += (p.target - p.glow) * 0.4;
      if (k === "h2") { p.mesh.material.color.copy(p.base).lerp(accent, p.glow * 0.8); p.mesh.material.emissive.copy(accent).multiplyScalar(p.glow * 0.5); }
      else { p.mesh.material.color.copy(accent); p.mesh.material.opacity = p.glow * 0.8; } }
    spin *= 0.9; wheel.rotation.z += spin;
    controls.update(); renderer.render(scene, camera);
  }
  function resize() { const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  new ResizeObserver(resize).observe(host); resize(); requestAnimationFrame(frame);
  window.Mouse3D = {
    set(id, on) { if (parts[id]) parts[id].target = on ? 1 : 0; },
    scroll(dir) { spin += dir * 0.5; },
    resetView() { camera.position.copy(HOME); controls.target.set(0, Hh * 0.35, 0); controls.update(); },
    autoRotate(on) { controls.autoRotate = on; },
    view(az, el) { const d = L * 2.25; camera.position.set(d * Math.sin(az) * Math.cos(el), d * Math.sin(el), d * Math.cos(az) * Math.cos(el)); controls.update(); },
  };
  document.dispatchEvent(new Event("mouse3d-ready"));
}
start().catch((e) => { console.error("3D view failed", e); fail("error", e && e.message); });
