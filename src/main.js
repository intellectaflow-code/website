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
const cam = new THREE.PerspectiveCamera(55, 1, 0.1, 250)
cam.position.set(0, 0, 8)

// soft glow sprite
const c = document.createElement('canvas'); c.width = c.height = 64
const g = c.getContext('2d').createRadialGradient(32, 32, 0, 32, 32, 32)
g.addColorStop(0, '#fff'); g.addColorStop(.3, 'rgba(180,174,255,.6)'); g.addColorStop(1, 'rgba(126,98,238,0)')
c.getContext('2d').fillStyle = g; c.getContext('2d').fillRect(0, 0, 64, 64)
const sprite = new THREE.CanvasTexture(c)
const glow = (size, o = 1) => new THREE.PointsMaterial({ size, map: sprite, vertexColors: true, transparent: true, opacity: o, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true })
const mix = t => new THREE.Color(V).lerp(new THREE.Color(B), t)

// ---- neural "brain": point cloud + synapse lines ----
function makeBrain(n = 850) {
  const grp = new THREE.Group(), P = [], col = []
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize()
    let r = 1 + .09 * Math.sin(v.x * 9) * Math.sin(v.y * 7) * Math.sin(v.z * 8)
    v.set(v.x * 1.35, v.y * (v.y < 0 ? .62 : .95), v.z * 1.0).multiplyScalar(r)
    v.x += Math.sign(v.x) * .05
    P.push(v); col.push(...mix((v.x + 1.4) / 2.8).toArray())
  }
  const pg = new THREE.BufferGeometry().setFromPoints(P)
  pg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  const pts = new THREE.Points(pg, glow(.09))
  const L2 = [], lc = []
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++)
    if (P[i].distanceTo(P[j]) < .27) { L2.push(P[i], P[j]); const k = mix((P[i].x + 1.4) / 2.8).toArray(); lc.push(...k, ...k) }
  const lg = new THREE.BufferGeometry().setFromPoints(L2)
  lg.setAttribute('color', new THREE.Float32BufferAttribute(lc, 3))
  const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: .35, blending: THREE.AdditiveBlending, depthWrite: false }))
  grp.add(pts, lines); return grp
}
const brain = makeBrain(); brain.scale.setScalar(2.2); scene.add(brain)
const brain2 = makeBrain(600); brain2.scale.setScalar(1.8); brain2.position.set(3.4, 0, -102); scene.add(brain2)

// ---- depth particle field ----
{
  const n = 3200, p = [], col = []
  for (let i = 0; i < n; i++) { p.push(rnd(-34, 34), rnd(-20, 20), rnd(-120, 12)); col.push(...mix(Math.random()).toArray()) }
  const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); gg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  scene.add(new THREE.Points(gg, glow(.14, .8)))
}
const wire = (geo, color, op = .55) => new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: op, blending: THREE.AdditiveBlending }))

// ---- set pieces (one per section) ----
const ico = wire(new THREE.IcosahedronGeometry(2.1, 2), V); ico.position.set(3.6, 0, -22); scene.add(ico)       // MindProbe
const ico2 = wire(new THREE.IcosahedronGeometry(1.2, 1), L, .8); ico.add(ico2)
const waves = new THREE.Group(); waves.position.set(-3.8, 0, -42); scene.add(waves)                                // Brain Lens (EEG)
const wl = []
for (let k = 0; k < 6; k++) {
  const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(121 * 3), 3))
  const l = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: k % 2 ? B : L, transparent: true, opacity: .8, blending: THREE.AdditiveBlending }))
  l.position.y = (k - 2.5) * .55; l.userData.k = k; waves.add(l); wl.push(l)
}
const rings = new THREE.Group(); rings.position.set(3.6, 0, -62); scene.add(rings)                                 // Testarena
for (let k = 0; k < 4; k++) { const t = wire(new THREE.TorusGeometry(1 + k * .55, .03 + k * .01, 12, 80), k % 2 ? B : V, .9); t.rotation.x = k * .5; rings.add(t) }
const globe = wire(new THREE.SphereGeometry(4.2, 28, 20), V, .25); globe.position.set(0, 0, -82); scene.add(globe) // About
const orbit = new THREE.Group(); globe.add(orbit)
for (let k = 0; k < 14; k++) { const s = new THREE.Mesh(new THREE.SphereGeometry(.12, 12, 12), new THREE.MeshBasicMaterial({ color: L })); const a = k / 14 * 6.283; s.position.set(Math.cos(a) * 5.2, Math.sin(a * 3) * 1.2, Math.sin(a) * 5.2); orbit.add(s) }

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
  tz = targetZ(); cam.position.z += (tz - cam.position.z) * .06
  cam.position.x += (mx * 1.6 - cam.position.x) * .04; cam.position.y += (-my * 1.0 - cam.position.y) * .04
  cam.lookAt(0, 0, cam.position.z - 8)
  brain.rotation.y = t * .18 + mx * .6; brain.rotation.x = Math.sin(t * .4) * .08 - my * .3
  brain2.rotation.y = -t * .15
  ico.rotation.set(t * .2, t * .3, 0); ico2.rotation.set(-t * .4, t * .2, 0)
  rings.children.forEach((r, i) => { r.rotation.x += .004 * (i + 1); r.rotation.y += .003 * (i % 2 ? -1 : 1) })
  globe.rotation.y = t * .05; orbit.rotation.y = -t * .25
  wl.forEach(l => { const a = l.geometry.attributes.position, k = l.userData.k
    for (let i = 0; i <= 120; i++) { const x = (i / 120 - .5) * 6; a.setXYZ(i, x, Math.sin(x * 2 + t * (1.2 + k * .3)) * .25 * Math.sin(x * .8 + t) + Math.sin(x * 5 + t * 2 + k) * .06, 0) }
    a.needsUpdate = true })
  renderer.render(scene, cam)
})

// ---- UI ----
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
