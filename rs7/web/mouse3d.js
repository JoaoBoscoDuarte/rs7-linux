// Procedural 3D RS7-style mouse (three.js, vendored). An approximation of the shape, not a scan of the device.
import * as THREE from "three";
import { OrbitControls } from "./vendor/OrbitControls.js";
import { RoomEnvironment } from "./vendor/RoomEnvironment.js";

const host = document.getElementById("m3d");
let renderer = null;
try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" }); } catch (e) { /* no WebGL */ }
if (!renderer) { window.Mouse3D = null; document.dispatchEvent(new Event("mouse3d-fail")); }
else {
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture; scene.environmentIntensity = 0.42;
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  const HOME = new THREE.Vector3(-4.2, 4.6, -6.3);          // 3/4 view from the front-left, like the product photo
  camera.position.copy(HOME);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false; controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.minDistance = 4; controls.maxDistance = 16; controls.maxPolarAngle = Math.PI * 0.62;
  controls.target.set(0, 0.25, -0.15); controls.autoRotateSpeed = 1.6;
  const key = new THREE.DirectionalLight(0xffffff, 2.6); key.position.set(-4, 7, -3); scene.add(key);
  const rim = new THREE.DirectionalLight(0x9db8ff, 1.2); rim.position.set(5, 3, -5); scene.add(rim);

  // ---- body: lofted surface. x = width, y = up, z = length (front = -z, rear = +z)
  const L = 1.9, W = 0.95, H = 1.2, BASE = 0.06, N = 120, M = 64;
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  // proportions measured from the product photos: widest in the front-middle, waist at ~2/3, narrower round rear
  const xw = (z) => { const u = z / L, a = Math.abs(u), p = u < 0 ? 4.4 : 2.4;
    let w = W * Math.pow(Math.max(0, 1 - Math.pow(a, p)), 1 / 2.5);
    w *= 1 - 0.07 * sm(-0.5, -1, u);                         // front tapers a little
    w *= 1 - 0.19 * sm(0.1, 0.9, u);                          // rear narrower than the front-middle
    w *= 1 - 0.05 * Math.exp(-Math.pow((u - 0.4) / 0.2, 2));  // waist
    return w; };
  // side profile: highest a bit ahead of the middle, low rear
  const hz = (z) => { const u = z / L; return H * (0.4 + 0.6 * Math.exp(-Math.pow((u - 0.12) / 0.55, 2))) * (1 - 0.3 * sm(0.8, 1, u)); };
  const pos = [], zOf = (i) => -L * Math.cos(Math.PI * i / N);
  for (let i = 0; i <= N; i++) { const z = zOf(i), w = xw(z), h = hz(z);
    for (let j = 0; j <= M; j++) { const th = Math.PI * j / M;
      pos.push(w * Math.cos(th), BASE + (h - BASE) * Math.pow(Math.sin(th), 0.5), z); } }
  const tri = [], cell = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) { const a = i * (M + 1) + j, b = a + 1, c = a + (M + 1), d = c + 1; tri.push([a, b, c], [b, d, c]); cell.push([i, j], [i, j]); }
  const full = new THREE.BufferGeometry(); full.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); full.setIndex(tri.flat()); full.computeVertexNormals();
  const nor = full.attributes.normal;
  const ZF = -L * 0.95, ZS = -L * 0.12;                      // button area: nose .. ZS
  const groups = { rest: [], left: [], right: [] };
  tri.forEach((t, k) => { const [i, j] = cell[k]; const zc = (zOf(i) + zOf(i + 1)) / 2;
    const top = j > 4 && j < M - 4, gap = Math.abs(j + 0.5 - M / 2) < 1.7, tt = Math.cos(Math.PI * (j + 0.5) / M);
    let g = "rest"; if (top && zc > ZF && zc < ZS + 0.07 * L * (1 - tt * tt) && !gap) g = (j + 0.5 < M / 2) ? "right" : "left"; groups[g].push(t); });
  const part = (tris, lift = 0) => { const g = new THREE.BufferGeometry(); const P = [], Nn = [];
    for (const t of tris) for (const v of t) { const nx = nor.getX(v), ny = nor.getY(v), nz = nor.getZ(v);
      P.push(pos[3 * v] + nx * lift, pos[3 * v + 1] + ny * lift, pos[3 * v + 2] + nz * lift); Nn.push(nx, ny, nz); }
    const C = []; for (let q = 1; q < P.length; q += 3) { const a = 0.5 + 0.5 * sm(0.02, 0.5, P[q]); C.push(a, a, a * 1.02); }
    g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(Nn, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(C, 3)); return g; };
  const glossy = (col, rough = 0.28, vc = false) => new THREE.MeshPhysicalMaterial({ color: col, roughness: rough, metalness: 0.0, clearcoat: 0.25, clearcoatRoughness: 0.45, emissive: 0x000000, vertexColors: vc });
  const matte = (col, rough = 0.7) => new THREE.MeshStandardMaterial({ color: col, roughness: rough, metalness: 0.05, emissive: 0x000000 });
  scene.add(new THREE.Mesh(part(groups.rest), glossy(0xe4e8ef, 0.5, true)));
  const parts = {};
  const mk = (id, mesh) => { scene.add(mesh); parts[id] = { mesh, base: mesh.material.color.clone(), glow: 0, target: 0 }; return mesh; };
  mk("h0", new THREE.Mesh(part(groups.left, 0.011), glossy(0xdde2ea, 0.5, true)));
  mk("h1", new THREE.Mesh(part(groups.right, 0.011), glossy(0xdde2ea, 0.5, true)));
  // underside
  const pr = [], pl = []; for (let i = 0; i <= N; i++) { const z = zOf(i), w = xw(z); pr.push(new THREE.Vector2(w, z)); pl.push(new THREE.Vector2(-w, z)); }
  const sh = new THREE.Shape(); sh.setFromPoints([...pr, ...pl.reverse()]);
  const under = new THREE.Mesh(new THREE.ShapeGeometry(sh), matte(0x8d95a3)); under.rotation.x = Math.PI / 2; under.position.y = 0.004; scene.add(under);

  const ray = new THREE.Raycaster(); const solid = new THREE.Mesh(full, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })); solid.updateMatrixWorld();
  const topY = (x, z) => { ray.set(new THREE.Vector3(x, 5, z), new THREE.Vector3(0, -1, 0)); const h = ray.intersectObject(solid)[0]; return h ? h.point.y : 0; };
  const dark = matte(0x0c0e12, 0.85);
  // seams: centre slit between L and R, and the arched line behind the main buttons (dark tubes lying on the surface)
  const seam = (pts, r) => { const c = new THREE.CatmullRomCurve3(pts); const m = new THREE.Mesh(new THREE.TubeGeometry(c, 80, r, 6, false), dark); scene.add(m); };
  { const pts = []; for (let k = 0; k <= 30; k++) { const z = ZF + 0.04 + (ZS + 0.07 * L - ZF - 0.04) * k / 30; pts.push(new THREE.Vector3(0, topY(0, z) + 0.004, z)); } seam(pts, 0.024); }
  { const pts = []; for (let k = 0; k <= 40; k++) { const t = -0.93 + 1.86 * k / 40, zb = ZS + 0.07 * L * (1 - t * t), x = t * xw(zb) * 0.98; pts.push(new THREE.Vector3(x, topY(x, zb) + 0.004, zb)); } seam(pts, 0.012); }
  // wheel in its slot, DPI button behind it
  const wz = -0.64 * L, wy = topY(0, wz);
  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.03, 0.46), dark); slot.position.set(0, wy + 0.004, wz); scene.add(slot);
  const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.12, 40), matte(0x15181d, 0.55));
  wheel.rotation.z = Math.PI / 2; wheel.position.set(0, wy + 0.035, wz); mk("h2", wheel);
  const ribs = new THREE.Group();
  for (let i = 0; i < 14; i++) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.014, 0.034), matte(0x2b3038, 0.9)); r.rotation.x = i * Math.PI / 7; r.translateY(0.15); ribs.add(r); }
  ribs.position.copy(wheel.position); scene.add(ribs); parts.h2.ribs = ribs;
  const ring = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.012, 0.4), new THREE.MeshBasicMaterial({ color: 0x35e0ff, transparent: true, opacity: 0.55 })); ring.position.set(0, wy + 0.022, wz); scene.add(ring);
  const dz = -0.31 * L, dpiBtn = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.1, 6, 16), glossy(0xf4f6fa, 0.4));
  dpiBtn.rotation.x = Math.PI / 2; dpiBtn.scale.set(1, 1, 0.5); dpiBtn.position.set(0, topY(0, dz) + 0.012, dz); mk("h5", dpiBtn);
  // side buttons on the left flank: forward = front one, back = rear one
  for (const [id, zz] of [["h4", -0.27 * L], ["h3", 0.03 * L]]) {
    const y = 0.34; ray.set(new THREE.Vector3(-5, y, zz), new THREE.Vector3(1, 0, 0)); const hit = ray.intersectObject(solid)[0];
    const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.2, 6, 14), glossy(0xf4f6fa, 0.4));
    b.rotation.x = Math.PI / 2; b.scale.set(0.5, 1, 1); b.position.set(hit ? hit.point.x + 0.005 : -xw(zz) * 0.95, y, zz); mk(id, b); }
  // scroll arrows
  for (const id of ["hup", "hdn"]) { const a = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.1, 3), matte(0x8a93a3, 0.5)); a.rotation.x = id === "hup" ? -Math.PI / 2 : Math.PI / 2;
    const az = wz + (id === "hup" ? -0.33 : 0.33); a.position.set(0, topY(0, az) + 0.02, az); mk(id, a); }
  // soft contact shadow
  const cv = document.createElement("canvas"); cv.width = cv.height = 128; const cx = cv.getContext("2d");
  const gr = cx.createRadialGradient(64, 64, 8, 64, 64, 62); gr.addColorStop(0, "rgba(0,0,0,.55)"); gr.addColorStop(1, "rgba(0,0,0,0)"); cx.fillStyle = gr; cx.fillRect(0, 0, 128, 128);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 5.4), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.set(0.05, -0.004, 0.1); scene.add(shadow);

  const accent = new THREE.Color(0x0095ff); let spin = 0;
  function frame() {
    requestAnimationFrame(frame);
    if (!host.offsetParent) return;
    const cs = getComputedStyle(document.documentElement).getPropertyValue("--acc").trim(); if (cs) accent.set(cs);
    for (const k in parts) { const p = parts[k]; p.glow += (p.target - p.glow) * 0.35;
      p.mesh.material.color.copy(p.base).lerp(accent, p.glow * 0.75); p.mesh.material.emissive.copy(accent).multiplyScalar(p.glow * 0.5); }
    spin *= 0.9; wheel.rotation.x += spin; parts.h2.ribs.rotation.x = wheel.rotation.x;
    controls.update(); renderer.render(scene, camera);
  }
  function resize() { const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  new ResizeObserver(resize).observe(host); resize(); requestAnimationFrame(frame);

  window.Mouse3D = {
    set(id, on) { if (parts[id]) parts[id].target = on ? 1 : 0; },
    scroll(dir) { spin += dir * 0.5; },
    resetView() { camera.position.copy(HOME); controls.target.set(0, 0.25, -0.15); controls.update(); },
    autoRotate(on) { controls.autoRotate = on; },
    view(az, el, dist) { const d = dist || 7.2; camera.position.set(d * Math.sin(az) * Math.cos(el), d * Math.sin(el), d * Math.cos(az) * Math.cos(el)); controls.update(); },
  };
  document.dispatchEvent(new Event("mouse3d-ready"));
}
