// Procedural 3D RS7-style mouse (three.js, vendored). Not a scan of the real device: an approximation for button/wheel feedback.
import * as THREE from "three";
import { OrbitControls } from "./vendor/OrbitControls.js";

const host = document.getElementById("m3d");
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
} catch (e) { renderer = null; }
if (!renderer) { window.Mouse3D = null; document.dispatchEvent(new Event("mouse3d-fail")); }
else {
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  const HOME = new THREE.Vector3(-1.9, 5.4, 4.9);   // behind the mouse, slightly left and above
  camera.position.copy(HOME);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false; controls.enableDamping = true; controls.minDistance = 3.5; controls.maxDistance = 16;
  controls.target.set(0, 0.25, -0.1); controls.autoRotateSpeed = 1.2;

  scene.add(new THREE.HemisphereLight(0xffffff, 0x445066, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(4, 8, 5); scene.add(key);
  const rim = new THREE.DirectionalLight(0x88aaff, 1.0); rim.position.set(-6, 3, -5); scene.add(rim);

  // ---- body: lofted surface. x = width, y = up, z = length (front = -z, rear = +z)
  const L = 1.75, W = 0.98, H = 0.82, BASE = 0.07, N = 90, M = 56;
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const xw = (z) => { const q = Math.abs(z / L); const tp = 1 - 0.07 * sm(0.0, -1, z / L); return W * tp * Math.pow(Math.max(0, 1 - Math.pow(q, 3.1)), 1 / 2.6) * (1 + 0.05 * sm(-0.3, 0.6, z / L)); };
  const hz = (z) => { const u = z / L; return H * (0.52 + 0.48 * Math.exp(-Math.pow((u - 0.28) / 0.62, 2))) * (1 - 0.35 * sm(0.8, 1, u)) * (1 - 0.1 * sm(-0.2, -1, u)); };
  const P = [], pos = [];
  const zOf = (i) => -L * Math.cos(Math.PI * i / N);        // dense near both ends, i=0 front .. N rear
  for (let i = 0; i <= N; i++) { const z = zOf(i), w = xw(z), h = hz(z);
    for (let j = 0; j <= M; j++) { const th = Math.PI * j / M;   // j=0 right edge (+x) .. M left edge (-x)
      pos.push(w * Math.cos(th), BASE + Math.max(0, h - BASE) * Math.pow(Math.sin(th), 0.62), z); } }
  const idxAll = []; const cell = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) { const a = i * (M + 1) + j, b = a + 1, c = a + (M + 1), d = c + 1; idxAll.push([a, b, c], [b, d, c]); cell.push([i, j], [i, j]); }
  const full = new THREE.BufferGeometry(); full.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); full.setIndex(idxAll.flat()); full.computeVertexNormals();
  const nor = full.attributes.normal;
  const ZS = -0.18 * L, ZF = -0.98 * L;                     // button area: from front tip to ZS
  const groups = { rest: [], left: [], right: [] };
  idxAll.forEach((tri, k) => { const [i, j] = cell[k]; const zc = (zOf(i) + zOf(i + 1)) / 2;
    const top = j > 3 && j < M - 3, gap = Math.abs(j + 0.5 - M / 2) < 1.2;
    let g = "rest"; if (top && zc > ZF + 0.12 && zc < ZS && !gap) g = (j + 0.5 < M / 2) ? "right" : "left"; groups[g].push(tri); });
  const part = (tris) => { const g = new THREE.BufferGeometry(); const Pp = [], Nn = [];
    for (const tri of tris) for (const v of tri) { Pp.push(pos[3 * v], pos[3 * v + 1], pos[3 * v + 2]); Nn.push(nor.getX(v), nor.getY(v), nor.getZ(v)); }
    g.setAttribute("position", new THREE.Float32BufferAttribute(Pp, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(Nn, 3)); return g; };
  const mat = (col, rough = 0.32) => new THREE.MeshStandardMaterial({ color: col, roughness: rough, metalness: 0.04, emissive: 0x000000 });
  const body = new THREE.Mesh(part(groups.rest), mat(0xf3f5f9)); scene.add(body);
  // flat underside
  const sh = new THREE.Shape(); const ptsR = [], ptsL = [];
  for (let i = 0; i <= N; i++) { const z = zOf(i), w = xw(z); ptsR.push(new THREE.Vector2(w, z)); ptsL.push(new THREE.Vector2(-w, z)); }
  sh.setFromPoints([...ptsR, ...ptsL.reverse()]);
  const under = new THREE.Mesh(new THREE.ShapeGeometry(sh), mat(0x9aa2b0, 0.6)); under.rotation.x = Math.PI / 2; under.position.y = 0.005; scene.add(under);
  const parts = {};
  const mk = (id, mesh) => { mesh.userData.id = id; scene.add(mesh); parts[id] = { mesh, base: mesh.material.color.clone(), glow: 0, target: 0 }; return mesh; };
  mk("h0", new THREE.Mesh(part(groups.left), mat(0xdde2ec)));
  mk("h1", new THREE.Mesh(part(groups.right), mat(0xdde2ec)));

  const ray = new THREE.Raycaster(); const solid = new THREE.Mesh(full, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })); solid.updateMatrixWorld();
  const topY = (x, z) => { ray.set(new THREE.Vector3(x, 5, z), new THREE.Vector3(0, -1, 0)); const h = ray.intersectObject(solid)[0]; return h ? h.point.y : 0; };
  // groove lines between the two main buttons (dark inlay)
  const dark = mat(0x0d0f13, 0.9);
  const gz0 = ZF + 0.12, gz1 = ZS, SEG = 24;
  for (let k = 0; k < SEG; k++) { const z0 = gz0 + (gz1 - gz0) * k / SEG, z1 = gz0 + (gz1 - gz0) * (k + 1) / SEG, zm = (z0 + z1) / 2;
    const g = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.016, (z1 - z0) * 1.05), dark); g.position.set(0, topY(0, zm) + 0.002, zm); g.rotation.x = Math.atan2(topY(0, z1) - topY(0, z0), z1 - z0) * -1; scene.add(g); }

  // wheel (in a slot between the buttons), DPI button behind it
  const wz = -0.56 * L, wy = topY(0, wz);
  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.03, 0.46), dark); slot.position.set(0, wy + 0.012, wz); scene.add(slot);
  const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.13, 32), mat(0x1d2128, 0.55));
  wheel.rotation.z = Math.PI / 2; wheel.position.set(0, wy + 0.03, wz); mk("h2", wheel);
  const ribs = new THREE.Group(); for (let i = 0; i < 12; i++) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.135, 0.012, 0.03), mat(0x3a414c, 0.9)); r.position.set(0, 0, 0); r.rotation.x = i * Math.PI / 6; r.translateY(0.15); ribs.add(r); }
  ribs.position.copy(wheel.position); scene.add(ribs); parts.h2.ribs = ribs;
  const dz = -0.28 * L, dy = topY(0, dz);
  const dpiBtn = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.045, 0.22), mat(0xdde2ea, 0.3)); dpiBtn.position.set(0, dy + 0.01, dz); mk("h5", dpiBtn);
  // side buttons on the left flank: forward = front one, back = rear one
  for (const [id, zz] of [["h4", -0.5 * L], ["h3", -0.2 * L]]) {
    const y = 0.38; ray.set(new THREE.Vector3(-5, y, zz), new THREE.Vector3(1, 0, 0)); const hit = ray.intersectObject(solid)[0]; const x = hit ? hit.point.x - 0.01 : -xw(zz) * 0.9;
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.17, 0.3), mat(0xdde2ea, 0.3)); b.position.set(x, y, zz); b.rotation.y = 0.12; mk(id, b);
  }
  // scroll arrows (printed on the top, glow when scrolling)
  for (const id of ["hup", "hdn"]) {
    const a = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.1, 3), mat(0x7e8796, 0.5)); a.rotation.x = id === "hup" ? -Math.PI / 2 : Math.PI / 2;
    const az = wz + (id === "hup" ? -0.34 : 0.34); a.position.set(0, topY(0, az) + 0.02, az); mk(id, a);
  }

  const accent = new THREE.Color(0x0095ff);
  let spin = 0;
  function frame(t) {
    requestAnimationFrame(frame);
    if (!host.offsetParent) return;                // hidden tab: skip
    const cs = getComputedStyle(document.documentElement).getPropertyValue("--acc").trim(); if (cs) accent.set(cs);
    for (const k in parts) {
      const p = parts[k]; p.glow += (p.target - p.glow) * 0.35;
      p.mesh.material.color.copy(p.base).lerp(accent, p.glow * 0.7); p.mesh.material.emissive.copy(accent).multiplyScalar(p.glow * 0.55);
      if (k !== "h2") p.mesh.material.emissiveIntensity = 1;
    }
    
    spin *= 0.9; wheel.rotation.x += spin; parts.h2.ribs.rotation.x = wheel.rotation.x;
    controls.update(); renderer.render(scene, camera);
  }
  function resize() { const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  new ResizeObserver(resize).observe(host); resize(); requestAnimationFrame(frame);

  window.Mouse3D = {
    set(id, on) { if (parts[id]) parts[id].target = on ? 1 : 0; },
    scroll(dir) { spin += dir * 0.5; },
    resetView() { camera.position.copy(HOME); controls.target.set(0, 0.25, -0.1); controls.update(); },
    autoRotate(on) { controls.autoRotate = on; },
  };
  document.dispatchEvent(new Event("mouse3d-ready"));
}
