import * as THREE from 'three'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
gsap.registerPlugin(ScrollTrigger)

const V = 0x7e62ee, B = 0x4f80ee, L = 0xb4aeff
const rnd = (a, b) => a + Math.random() * (b - a)
const canvas = document.getElementById('bg')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
const scene = new THREE.Scene()
scene.fog = new THREE.FogExp2(0x0b0314, 0.016)
const cam = new THREE.PerspectiveCamera(55, 1, 0.1, 320)
cam.position.set(0, 0, 8)

// soft glow sprite (128px for crisp points)
const c = document.createElement('canvas'); c.width = c.height = 128
const cx = c.getContext('2d'), g = cx.createRadialGradient(64, 64, 0, 64, 64, 64)
g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.18, 'rgba(220,214,255,.85)'); g.addColorStop(.45, 'rgba(150,130,255,.28)'); g.addColorStop(1, 'rgba(126,98,238,0)')
cx.fillStyle = g; cx.fillRect(0, 0, 128, 128)
const sprite = new THREE.CanvasTexture(c)
const glow = (size, o = 1) => new THREE.PointsMaterial({ size, map: sprite, vertexColors: true, transparent: true, opacity: o, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true })
const mix = t => new THREE.Color(V).lerp(new THREE.Color(B), t)

// ---- neural "brain": dense point cloud + synapse web with traveling signal pulses ----
const U = { uT: { value: 0 }, uPx: { value: renderer.getPixelRatio() }, map: { value: sprite } }
const WAVE = 'dot(position, vec3(1., .4, .6)) * 2.4 - uT * 1.8'
const ptsMat = new THREE.ShaderMaterial({ uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: `attribute vec3 aCol; attribute float aPh; uniform float uT, uPx; varying vec3 vC; varying float vW;
  void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.); float w = pow(sin(${WAVE} + aPh * .6) * .5 + .5, 3.); vW = w; vC = aCol;
  gl_PointSize = (.35 + .75 * w + .03 * aPh) * uPx * 60. / -mv.z; gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `uniform sampler2D map; varying vec3 vC; varying float vW;
  void main(){ float a = texture2D(map, gl_PointCoord).a; gl_FragColor = vec4(mix(vC, vec3(1.), vW * .7) * (.55 + 1.2 * vW), a); }` })
const lnMat = new THREE.ShaderMaterial({ uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: `attribute vec3 aCol; uniform float uT; varying vec3 vC; varying float vW;
  void main(){ vC = aCol; vW = pow(sin(${WAVE}) * .5 + .5, 4.); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
  fragmentShader: `varying vec3 vC; varying float vW; void main(){ gl_FragColor = vec4(vC * (.25 + 1.1 * vW), .2 + .5 * vW); }` })
function makeBrain(n = 2000) {
  const grp = new THREE.Group(), P = [], col = [], ph = []
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize()
    const r = 1 + .09 * Math.sin(v.x * 9) * Math.sin(v.y * 7) * Math.sin(v.z * 8)
    v.set(v.x * 1.35, v.y * (v.y < 0 ? .62 : .95), v.z * 1.0).multiplyScalar(r)
    v.x += Math.sign(v.x) * .05
    P.push(v); col.push(...mix((v.x + 1.4) / 2.8).toArray()); ph.push(Math.random() * 6.28)
  }
  const pg = new THREE.BufferGeometry().setFromPoints(P)
  pg.setAttribute('aCol', new THREE.Float32BufferAttribute(col, 3)); pg.setAttribute('aPh', new THREE.Float32BufferAttribute(ph, 1))
  const pts = new THREE.Points(pg, ptsMat); pts.frustumCulled = false
  const L2 = [], lc = [], cnt = new Uint8Array(n), R = n > 1500 ? .2 : .26
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n && cnt[i] < 5; j++)
    if (cnt[j] < 5 && P[i].distanceTo(P[j]) < R) { L2.push(P[i], P[j]); cnt[i]++; cnt[j]++; const k = mix((P[i].x + 1.4) / 2.8).toArray(); lc.push(...k, ...k) }
  const lg = new THREE.BufferGeometry().setFromPoints(L2)
  lg.setAttribute('aCol', new THREE.Float32BufferAttribute(lc, 3))
  const lines = new THREE.LineSegments(lg, lnMat); lines.frustumCulled = false
  grp.add(pts, lines); return grp
}
const brain = makeBrain(); brain.scale.setScalar(2.2); scene.add(brain)
const brain2 = makeBrain(1300); brain2.scale.setScalar(1.8); brain2.position.set(3.4, 0, -152); scene.add(brain2)

// ---- depth particle field ----
{
  const n = 4800, p = [], col = []
  for (let i = 0; i < n; i++) { p.push(rnd(-34, 34), rnd(-20, 20), rnd(-190, 12)); col.push(...mix(Math.random()).toArray()) }
  const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); gg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  scene.add(new THREE.Points(gg, glow(.14, .8)))
}
const wire = (geo, color, op = .55) => new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: op, blending: THREE.AdditiveBlending }))

// ---- set pieces (one per section) ----
const ico = wire(new THREE.IcosahedronGeometry(2.1, 3), V); ico.position.set(3.6, 0, -52); scene.add(ico)       // MindProbe
const ico2 = wire(new THREE.IcosahedronGeometry(1.2, 1), L, .8); ico.add(ico2)
const waves = new THREE.Group(); waves.position.set(-3.8, 0, -72); scene.add(waves)                                // Brain Lens (EEG)
const wl = []
for (let k = 0; k < 6; k++) {
  const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(241 * 3), 3))
  const l = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: k % 2 ? B : L, transparent: true, opacity: .8, blending: THREE.AdditiveBlending }))
  l.position.y = (k - 2.5) * .55; l.userData.k = k; waves.add(l); wl.push(l)
}
const rings = new THREE.Group(); rings.position.set(3.6, 0, -92); scene.add(rings)                                 // Testarena
for (let k = 0; k < 4; k++) { const t = wire(new THREE.TorusGeometry(1 + k * .55, .03 + k * .01, 16, 180), k % 2 ? B : V, .9); t.rotation.x = k * .5; rings.add(t) }
const globe = wire(new THREE.SphereGeometry(4.2, 48, 32), V, .25); globe.position.set(0, 0, -112); scene.add(globe) // About
const orbit = new THREE.Group(); globe.add(orbit)
for (let k = 0; k < 14; k++) { const s = new THREE.Mesh(new THREE.SphereGeometry(.12, 12, 12), new THREE.MeshBasicMaterial({ color: L })); const a = k / 14 * 6.283; s.position.set(Math.cos(a) * 5.2, Math.sin(a * 3) * 1.2, Math.sin(a) * 5.2); orbit.add(s) }

// Career OS: 8-node journey path
const path = new THREE.Group(); path.position.set(3.4, 0, -32); scene.add(path)
{
  const pts = [], nodes = []
  for (let k = 0; k < 8; k++) { const t = k / 7; pts.push(new THREE.Vector3((t - .5) * 7, Math.sin(t * 6.283) * 1.4 + t * 1.2 - .6, Math.cos(t * 5) * .8)) }
  const curve = new THREE.CatmullRomCurve3(pts)
  path.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(400)), new THREE.LineBasicMaterial({ color: L, transparent: true, opacity: .7, blending: THREE.AdditiveBlending })))
  pts.forEach((v, k) => { const m = new THREE.Mesh(new THREE.SphereGeometry(k === 7 ? .32 : .18, 16, 16), new THREE.MeshBasicMaterial({ color: k === 7 ? 0x5eead4 : k % 2 ? B : V })); m.position.copy(v); path.add(m); nodes.push(m) })
  path.userData.nodes = nodes
}

const pieces = [ico, waves, rings, globe, path, brain2]
pieces.forEach(o => { o.userData.z = o.position.z; o.userData.s0 = o.scale.x })

// ---- scroll: camera glides through stages (z from data-z) ----
const stages = [...document.querySelectorAll('[data-z]')]
let tz = 8, sc = 0, mx = 0, my = 0
const stops = () => stages.map(s => ({ y: s.offsetTop + s.offsetHeight / 2, z: +s.dataset.z }))
function targetZ() {
  const y = scrollY + innerHeight / 2, S = stops()
  if (y <= S[0].y) return S[0].z
  for (let i = 1; i < S.length; i++) if (y <= S[i].y) { const t = (y - S[i - 1].y) / Math.max(1, S[i].y - S[i - 1].y); return S[i - 1].z + (S[i].z - S[i - 1].z) * t }
  return S.at(-1).z
}
addEventListener('pointermove', e => { mx = e.clientX / innerWidth - .5; my = e.clientY / innerHeight - .5 })
function resize() {
  renderer.setSize(innerWidth, innerHeight, false); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix()
  const wide = cam.aspect > 1.05; brain.position.set(wide ? 3.4 : 0, wide ? 0 : 2.4, 0); brain.scale.setScalar(wide ? 2.2 : 1.5)
}
addEventListener('resize', resize); resize()

const clock = new THREE.Clock()
renderer.setAnimationLoop(() => {
  const t = clock.getElapsedTime()
  U.uT.value = t
  pieces.forEach(o => { const d = Math.abs(cam.position.z - o.userData.z); let f = Math.min(1, Math.max(0, 1 - (d - 15) / 14)); f = f * f * (3 - 2 * f)
    o.visible = f > .01; o.scale.setScalar(Math.max(.001, o.userData.s0 * f)) })
  tz = targetZ(); cam.position.z += (tz - cam.position.z) * .06
  cam.position.x += (mx * 1.6 - cam.position.x) * .04; cam.position.y += (-my * 1.0 - cam.position.y) * .04
  cam.lookAt(0, 0, cam.position.z - 8)
  brain.rotation.y = t * .18 + mx * .6; brain.rotation.x = Math.sin(t * .4) * .08 - my * .3
  brain2.rotation.y = -t * .15
  ico.rotation.set(t * .2, t * .3, 0); ico2.rotation.set(-t * .4, t * .2, 0)
  rings.children.forEach((r, i) => { r.rotation.x += .004 * (i + 1); r.rotation.y += .003 * (i % 2 ? -1 : 1) })
  path.rotation.y = Math.sin(t * .3) * .35; path.userData.nodes.forEach((m, i) => m.scale.setScalar(1 + .25 * Math.sin(t * 2 + i)))
  globe.rotation.y = t * .05; orbit.rotation.y = -t * .25
  wl.forEach(l => { const a = l.geometry.attributes.position, k = l.userData.k
    for (let i = 0; i <= 240; i++) { const x = (i / 240 - .5) * 6; a.setXYZ(i, x, Math.sin(x * 2 + t * (1.2 + k * .3)) * .25 * Math.sin(x * .8 + t) + Math.sin(x * 5 + t * 2 + k) * .06, 0) }
    a.needsUpdate = true })
  renderer.render(scene, cam)
})

// ---- UI ----
document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => {
  document.querySelectorAll('.tabs button,.tp').forEach(x => x.classList.remove('on'))
  b.classList.add('on'); document.getElementById('tab-' + b.dataset.tab).classList.add('on')
})
document.getElementById('demoForm').addEventListener('submit', e => {
  e.preventDefault(); const f = Object.fromEntries(new FormData(e.target))
  const body = `Name: ${f.name}\nInstitution: ${f.inst}\nRole: ${f.role}\nEmail: ${f.email}\n\n${f.msg}`
  location.href = 'mailto:info@intellectaflow.com?subject=' + encodeURIComponent('Institutional demo request: ' + f.inst) + '&body=' + encodeURIComponent(body)
})

document.querySelectorAll('[data-count]').forEach(el => {
  const end = +el.dataset.count, o = { v: 0 }
  ScrollTrigger.create({ trigger: el, start: 'top 90%', once: true, onEnter: () => gsap.to(o, { v: end, duration: 1.8, ease: 'power2.out', onUpdate: () => el.textContent = Math.round(o.v).toLocaleString('en-IN') + (el.dataset.plus ? '+' : '') }) })
})
const ov = document.getElementById('services')
const openSvc = () => { ov.hidden = false; requestAnimationFrame(() => ov.classList.add('open')); document.body.style.overflow = 'hidden' }
const closeSvc = () => { ov.classList.remove('open'); document.body.style.overflow = ''; setTimeout(() => ov.hidden = true, 350) }
document.querySelectorAll('[data-open="services"]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); openSvc() }))
ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('[data-close]')) closeSvc() })
addEventListener('keydown', e => { if (e.key === 'Escape' && !ov.hidden) closeSvc() })
if (location.hash === '#services') openSvc()

gsap.utils.toArray('.reveal').forEach(el => gsap.from(el, { y: 60, opacity: 0, duration: 1, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 82%' } }))
gsap.from('.hero-copy > *', { y: 40, opacity: 0, stagger: .12, duration: 1, delay: .6, ease: 'power3.out' })
document.querySelectorAll('.tilt').forEach(el => {
  el.addEventListener('pointermove', e => { const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5; el.style.transform = `perspective(800px) rotateY(${x * 14}deg) rotateX(${-y * 14}deg) scale(1.03)` })
  el.addEventListener('pointerleave', () => el.style.transform = '')
})
const links = document.getElementById('links')
document.getElementById('burger').onclick = () => links.classList.toggle('open')
links.querySelectorAll('a').forEach(a => a.onclick = () => links.classList.remove('open'))
document.getElementById('yr').textContent = new Date().getFullYear()
addEventListener('load', () => setTimeout(() => document.getElementById('loader').classList.add('done'), 600))
