// Andromeda Station · main script
// Classic (non-module) script so it also works when index.html is opened by double-click.

const LAUNCH_DATE = new Date("2027-03-14T06:00:00-06:00"); // next launch window
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- Countdown (hero + final CTA) ---------- */
function startCountdown() {
  const units = {
    days: document.querySelector('[data-unit="days"]'),
    hours: document.querySelector('[data-unit="hours"]'),
    minutes: document.querySelector('[data-unit="minutes"]'),
    seconds: document.querySelector('[data-unit="seconds"]'),
  };
  const finalDays = document.querySelector("[data-final-days]");
  const pad = (value, length = 2) => String(value).padStart(length, "0");

  function tick() {
    const diff = Math.max(0, LAUNCH_DATE - Date.now());
    const days = Math.floor(diff / 86_400_000);
    const hours = Math.floor(diff / 3_600_000) % 24;
    const minutes = Math.floor(diff / 60_000) % 60;
    const seconds = Math.floor(diff / 1000) % 60;

    units.days.textContent = pad(days, 3);
    units.hours.textContent = pad(hours);
    units.minutes.textContent = pad(minutes);
    units.seconds.textContent = pad(seconds);
    if (finalDays) finalDays.textContent = pad(days, 3);
  }

  tick();
  setInterval(tick, 1000);
}

/* ---------- Hero video: pause button + reduced motion ---------- */
function setupHeroVideo() {
  const video = document.querySelector("[data-hero-video]");
  const toggle = document.querySelector("[data-video-toggle]");
  if (!video || !toggle) return;
  const label = toggle.querySelector("[data-video-label]");

  const render = () => {
    toggle.classList.toggle("is-paused", video.paused);
    label.textContent = video.paused ? "Reproducir" : "Pausar";
  };

  // Respect the "reduce motion" setting: keep the still poster frame
  if (prefersReducedMotion) {
    video.removeAttribute("autoplay");
    video.pause();
  }

  toggle.addEventListener("click", () => (video.paused ? video.play() : video.pause()));
  video.addEventListener("play", render);
  video.addEventListener("pause", render);
  render();
}

/* ---------- Reveal sections on scroll ---------- */
function revealOnScroll() {
  const items = document.querySelectorAll(".reveal");
  if (prefersReducedMotion || !("IntersectionObserver" in window)) {
    items.forEach((item) => item.classList.add("is-visible"));
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -10% 0px" }
  );
  items.forEach((item) => observer.observe(item));
}

/* ---------- Orbit clock: the 12-hour visit as a tilted orbit ---------- */
function setupOrbitClock() {
  const root = document.querySelector("[data-orbit]");
  if (!root) return;
  const dial = root.querySelector(".orbit-dial");
  const svg = root.querySelector("[data-orbit-svg]");
  const slides = [...root.querySelectorAll(".orbit-slide")];
  const dots = [...root.querySelectorAll("[data-orbit-go]")];
  const timeEl = root.querySelector("[data-orbit-time]");
  const tagEl = root.querySelector("[data-orbit-tag]");
  const playBtn = root.querySelector("[data-orbit-play]");
  const NS = "http://www.w3.org/2000/svg";

  const START = 9;          // 09:00 docking
  const SPAN = 12;          // hours until reentry (21:00)
  const ORBIT_MIN = 92;     // one lap around Earth
  const SUNRISE_AT = 360;   // minutes after 09:00 that land on a sunrise (15:00)
  const TILT = -18;         // orbit tilt in degrees, same angle as the logo
  const DELAY = 6000;       // autoplay: time spent travelling to the next activity
  const JUMP = 900;         // manual jump animation
  const EARTH_TURN = 90;    // seconds for one full turn of the Earth texture
  const EARTH_MAP = "images/orbit/earth-map-v2-1024.webp";
  const desktop = window.matchMedia("(width >= 1024px)");
  const hours = slides.map((s) => Number(s.dataset.hour));

  let index = Math.max(0, slides.findIndex((s) => s.classList.contains("is-active")));
  let pos = hours[index];   // where the station is right now (hours, decimal)
  let jump = null;          // { from, to, start }
  let geo = null;           // geometry of the current drawing
  let parts = null;         // svg nodes updated every frame

  const make = (tag, attrs, parent = svg) => {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    parent.appendChild(el);
    return el;
  };
  const fraction = (h) => (h - START) / SPAN;

  /* Point on the tilted ellipse. f = 0..1 of the visit; starts at the front-bottom and runs clockwise.
     Returns [x, y, front] where front > 0 means the point is in front of the Earth. */
  function point(f, scale = 1) {
    const th = ((90 + f * 360) * Math.PI) / 180;
    const x = geo.rx * scale * Math.cos(th);
    const y = geo.ry * scale * Math.sin(th);
    const t = (TILT * Math.PI) / 180;
    return [geo.cx + x * Math.cos(t) - y * Math.sin(t), geo.cy + x * Math.sin(t) + y * Math.cos(t), Math.sin(th)];
  }
  function pathBetween(f0, f1, scale = 1) {
    const steps = Math.max(2, Math.ceil(Math.abs(f1 - f0) * 180));
    let d = "";
    for (let i = 0; i <= steps; i++) {
      const [x, y] = point(f0 + ((f1 - f0) * i) / steps, scale);
      d += `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    return d;
  }
  // Behind the Earth (and covered by it)?
  function occluded(x, y, front) {
    return front < 0 && Math.hypot(x - geo.cx, y - geo.cy) < geo.earth + 2;
  }

  function draw() {
    const isDesktop = desktop.matches;
    geo = isDesktop
      ? { w: 440, h: 310, cx: 220, cy: 158, rx: 200, ry: 76, earth: 96 }
      : { w: 360, h: 250, cx: 180, cy: 118, rx: 138, ry: 52, earth: 68 };
    svg.replaceChildren();
    svg.setAttribute("viewBox", `0 0 ${geo.w} ${geo.h}`);
    dial.style.setProperty("--cx", `${(geo.cx / geo.w) * 100}%`);
    dial.style.setProperty("--cy", `${(geo.cy / geo.h) * 100}%`);
    dial.style.setProperty("--earth-w", `${((geo.earth * 2 * 0.86) / geo.w) * 100}%`);

    const defs = make("defs", {});
    defs.innerHTML =
      '<radialGradient id="orbit-earth" cx="38%" cy="32%" r="78%"><stop offset="0" stop-color="#1f5f95"/>' +
      '<stop offset=".55" stop-color="#14365e"/><stop offset="1" stop-color="#0A1428"/></radialGradient>' +
      '<filter id="orbit-blur" x="-1" y="-1" width="3" height="3"><feGaussianBlur stdDeviation="4"/></filter>' +
      // Earth texture: 2:1 world map tiled horizontally; sliding it makes the planet turn
      `<pattern id="orbit-earth-tex" patternUnits="userSpaceOnUse" x="${geo.cx - geo.earth}" y="${geo.cy - geo.earth}" width="${geo.earth * 4}" height="${geo.earth * 2}">` +
      `<image href="${EARTH_MAP}" width="${geo.earth * 4}" height="${geo.earth * 2}" preserveAspectRatio="none"/></pattern>` +
      // Sphere shading: sunlit upper-left, night side lower-right, darker limb
      '<radialGradient id="orbit-earth-shade" cx="34%" cy="30%" r="80%">' +
      '<stop offset="0" stop-color="#0A1428" stop-opacity=".3"/><stop offset=".45" stop-color="#0A1428" stop-opacity=".5"/>' +
      '<stop offset=".75" stop-color="#0A1428" stop-opacity=".85"/><stop offset="1" stop-color="#0A1428" stop-opacity=".97"/></radialGradient>' +
      // front half = everything below the tilted major axis
      `<clipPath id="orbit-front"><rect x="-1000" y="${geo.cy}" width="3000" height="2000" transform="rotate(${TILT} ${geo.cx} ${geo.cy})"/></clipPath>`;

    // 1. Orbit lines (drawn once behind the Earth, then again in front, clipped)
    const lines = make("g", { id: "orbit-lines" });
    const total = SPAN * 60;
    make("path", { class: "orbit-night", d: pathBetween(0, 1, 1.13) }, lines);
    for (let m = (SUNRISE_AT % ORBIT_MIN) - ORBIT_MIN; m < total; m += ORBIT_MIN) {
      const from = Math.max(0, m), to = Math.min(total, m + ORBIT_MIN / 2);
      if (to > from) make("path", { class: "orbit-day", d: pathBetween(from / total, to / total, 1.13) }, lines);
    }
    make("path", { class: "orbit-track", d: pathBetween(0, 1) }, lines);
    for (let h = START; h < START + SPAN; h++) {
      const [x1, y1] = point(fraction(h), 0.95), [x2, y2] = point(fraction(h), 1.05);
      make("line", { class: "orbit-tick", x1, y1, x2, y2 }, lines);
    }
    const progress = make("path", { class: "orbit-progress", d: "" }, lines);

    // 2. Earth
    make("circle", { cx: geo.cx, cy: geo.cy, r: geo.earth + 6, fill: "none", stroke: "#5EC8F2", "stroke-opacity": 0.3, "stroke-width": 10, filter: "url(#orbit-blur)" });
    make("circle", { class: "orbit-earth", cx: geo.cx, cy: geo.cy, r: geo.earth, fill: "url(#orbit-earth)" }); // fallback while the map loads
    make("circle", { cx: geo.cx, cy: geo.cy, r: geo.earth, fill: "url(#orbit-earth-tex)" });
    make("circle", { class: "orbit-earth-shade", cx: geo.cx, cy: geo.cy, r: geo.earth, fill: "url(#orbit-earth-shade)" });
    const earthTex = svg.querySelector("#orbit-earth-tex");

    // 3. Front half of the orbit, over the Earth
    make("use", { href: "#orbit-lines", "clip-path": "url(#orbit-front)" });

    // 4. Activity markers + labels
    const markers = slides.map((slide, i) => {
      const [x, y, front] = point(fraction(hours[i]));
      const [lx, ly] = point(fraction(hours[i]), isDesktop ? 1.3 : 1.27);
      const g = make("g", { class: "orbit-stop" });
      if (occluded(x, y, front)) g.classList.add("is-hidden");
      else if (front < 0) g.classList.add("is-back");
      const halo = make("circle", { class: "orbit-halo", cx: x, cy: y, r: 15, filter: "url(#orbit-blur)" }, g);
      const dot = make("circle", { class: "orbit-marker", cx: x, cy: y, r: 6 }, g);
      const label = make("text", { class: "orbit-label", x: lx, y: ly + 3, "text-anchor": "middle" }, g);
      label.textContent = slide.dataset.time;
      dot.addEventListener("click", () => go(i));
      return { g, dot, halo, label };
    });

    // Start / end label at the front-bottom
    make("text", { class: "orbit-label orbit-label-start", x: geo.cx, y: geo.h - 4, "text-anchor": "middle" }).textContent = "09:00 ACOPLE · 21:00 REGRESO A CASA";

    // 5. The station travelling along the orbit
    const station = make("g", { class: "orbit-station" });
    make("circle", { r: 12, class: "orbit-station-glow", filter: "url(#orbit-blur)" }, station);
    make("rect", { x: -11, y: -2.5, width: 7, height: 5, rx: 1, class: "orbit-station-panel" }, station);
    make("rect", { x: 4, y: -2.5, width: 7, height: 5, rx: 1, class: "orbit-station-panel" }, station);
    make("circle", { r: 4.5, class: "orbit-station-core" }, station);

    parts = { progress, markers, station, earthTex };
    renderSlide();
    renderPosition();
  }

  // Info, dots and marker states for the current activity
  function renderSlide() {
    slides.forEach((s, i) => s.classList.toggle("is-active", i === index));
    dots.forEach((d, i) => {
      d.classList.toggle("is-active", i === index);
      d.classList.toggle("is-past", i < index);
      d.setAttribute("aria-current", i === index ? "step" : "false");
    });
    timeEl.textContent = slides[index].dataset.time;
    tagEl.textContent = slides[index].dataset.tagline;
    parts.markers.forEach((m, i) => {
      m.dot.setAttribute("r", i === index ? 9 : 6);
      m.g.classList.toggle("is-active", i === index);
    });
  }

  // Station, progress line and clock for the current position
  function renderPosition() {
    const f = Math.min(1, Math.max(0, fraction(pos)));
    parts.progress.setAttribute("d", f > 0.001 ? pathBetween(0, f) : "");
    const [x, y, front] = point(f);
    const scale = 0.85 + 0.25 * ((front + 1) / 2); // closer = bigger
    parts.station.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${scale.toFixed(3)})`);
    parts.station.classList.toggle("is-hidden", occluded(x, y, front));
    parts.markers.forEach((m, i) => m.g.classList.toggle("is-past", hours[i] <= pos + 1e-6 && i !== index));
  }

  /* Autoplay: the station travels to the next activity during DELAY ms.
     Stops for good when the visitor takes control; pauses on hover / keyboard focus. */
  let autoplay = !prefersReducedMotion;
  let onScreen = false;
  let holding = false;
  let elapsed = 0;
  let last = null;

  function setAutoplay(on) {
    autoplay = on;
    elapsed = 0;
    playBtn.classList.toggle("is-paused", !on);
    playBtn.setAttribute("aria-label", on ? "Pausar recorrido automático" : "Reanudar recorrido automático");
    dots.forEach((d) => d.style.removeProperty("--p"));
    if (!on && !jump) { pos = hours[index]; renderPosition(); }
  }

  function go(i, byUser = true) {
    if (byUser && autoplay) setAutoplay(false);
    dots.forEach((d) => d.style.removeProperty("--p"));
    elapsed = 0;
    index = (i + slides.length) % slides.length;
    renderSlide();
    if (byUser) jump = { from: pos, to: hours[index], start: performance.now() };
    else { pos = hours[index]; renderPosition(); }
  }

  function frame(now) {
    const dt = last === null ? 0 : now - last;
    last = now;
    // Earth turning slowly (only while visible; still with reduced motion)
    if (onScreen && !prefersReducedMotion && parts) {
      const width = geo.earth * 4;
      const offset = -((now / 1000 / EARTH_TURN) * width) % width;
      parts.earthTex.setAttribute("patternTransform", `translate(${offset.toFixed(2)} 0)`);
    }
    if (jump) {
      const t = prefersReducedMotion ? 1 : Math.min(1, (now - jump.start) / JUMP);
      const ease = 1 - Math.pow(1 - t, 3);
      pos = jump.from + (jump.to - jump.from) * ease;
      renderPosition();
      if (t >= 1) jump = null;
    } else if (autoplay && onScreen && !holding && !document.hidden) {
      elapsed += dt;
      const p = Math.min(1, elapsed / DELAY);
      const next = (index + 1) % slides.length;
      const target = next === 0 ? START + SPAN : hours[next]; // last stop rides on to reentry
      pos = hours[index] + (target - hours[index]) * p;
      dots[index].style.setProperty("--p", p.toFixed(3));
      renderPosition();
      if (p >= 1) go(next, false);
    }
    requestAnimationFrame(frame);
  }

  playBtn.addEventListener("click", () => setAutoplay(!autoplay));
  root.querySelector("[data-orbit-prev]").addEventListener("click", () => go(index - 1));
  root.querySelector("[data-orbit-next]").addEventListener("click", () => go(index + 1));
  dots.forEach((d) => d.addEventListener("click", () => go(Number(d.dataset.orbitGo))));

  new IntersectionObserver(([entry]) => (onScreen = entry.isIntersecting), { threshold: 0.4 }).observe(root);
  root.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") holding = true; });
  root.addEventListener("pointerleave", () => (holding = false));
  root.addEventListener("focusin", (e) => { if (e.target.matches(":focus-visible")) holding = true; });
  root.addEventListener("focusout", () => (holding = false));

  // Swipe on the info (mobile)
  const info = root.querySelector("[data-orbit-info]");
  let startX = null;
  info.addEventListener("pointerdown", (e) => (startX = e.clientX));
  info.addEventListener("pointerup", (e) => {
    if (startX === null) return;
    const dx = e.clientX - startX;
    startX = null;
    if (Math.abs(dx) > 50) go(index + (dx < 0 ? 1 : -1));
  });

  desktop.addEventListener("change", draw);
  draw();
  if (prefersReducedMotion) setAutoplay(false);
  requestAnimationFrame(frame);
}

/* ---------- Launch sequence: progress line + live telemetry ---------- */
function setupLaunchSequence() {
  const list = document.querySelector("[data-launch]");
  if (!list) return;
  const steps = [...list.querySelectorAll(".launch-step")];
  const panel = document.querySelector("[data-telemetry]");
  const field = (name) => panel?.querySelector(`[data-tel="${name}"]`);
  const ORBIT_ALT = 408;
  let current = { alt: 0, vel: 0, g: 1 };
  let activeIndex = -1;
  let frame = null;

  // Count smoothly from the previous reading to the new one
  function animateTo(target) {
    if (!panel) return;
    cancelAnimationFrame(frame);
    const from = { ...current };
    const duration = prefersReducedMotion ? 0 : 900;
    const start = performance.now();
    const step = (now) => {
      const t = duration ? Math.min(1, (now - start) / duration) : 1;
      const ease = 1 - Math.pow(1 - t, 3);
      current = {
        alt: from.alt + (target.alt - from.alt) * ease,
        vel: from.vel + (target.vel - from.vel) * ease,
        g: from.g + (target.g - from.g) * ease,
      };
      field("alt").textContent = Math.round(current.alt);
      field("vel").textContent = current.vel.toFixed(1);
      field("g").textContent = current.g.toFixed(1);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  }

  // Pinned scene: intro (state 0) + one state per entry. Section is tall, stage is sticky.
  const scene = document.querySelector("[data-launch-sky]");
  const rail = document.querySelector("[data-launch-rail]");
  const ticks = rail ? [...rail.querySelectorAll("[data-goto]")] : [];
  const STATES = steps.length + 1;

  function activate(index) {
    if (index === activeIndex) return;
    activeIndex = index;
    scene?.classList.toggle("is-started", index >= 0);
    steps.forEach((el, i) => {
      el.classList.toggle("is-current", i === index);
      el.classList.toggle("is-past", i < index);
    });
    ticks.forEach((el, i) => {
      el.classList.toggle("is-current", i === index);
      el.classList.toggle("is-past", i < index);
      if (i === index) el.setAttribute("aria-current", "step");
      else el.removeAttribute("aria-current");
    });
    if (!panel) return;
    const data = steps[Math.max(0, index)].dataset;
    const isOrbit = index >= 0 && steps[index].classList.contains("is-final");
    field("time").textContent = data.time;
    field("status").textContent = isOrbit ? "Órbita estable · 0 G" : "Telemetría · En vivo";
    field("bar").style.width = `${(Number(data.alt) / ORBIT_ALT) * 100}%`;
    panel.classList.toggle("is-orbit", isOrbit);
    animateTo({ alt: Number(data.alt), vel: Number(data.vel), g: Number(data.g) });
  }

  // 0 → 1 across the whole pinned scroll
  function sceneProgress() {
    const box = scene.getBoundingClientRect();
    const travel = box.height - window.innerHeight;
    return travel > 0 ? Math.min(1, Math.max(0, -box.top / travel)) : 0;
  }

  // On scroll: which state we are in, and how far the rail/sky have advanced
  function update() {
    if (!scene) return;
    const state = sceneProgress() * STATES;           // 0 … 7
    activate(Math.min(steps.length - 1, Math.floor(state) - 1));
    const fill = Math.min(1, Math.max(0, (state - 1) / (steps.length - 1)));
    rail?.style.setProperty("--fill", fill.toFixed(3));
    paintSky(fill);
    drawG(fill);
  }

  // Rail ticks jump to the middle of their entry's scroll range
  ticks.forEach((tick, i) => {
    tick.addEventListener("click", () => {
      const box = scene.getBoundingClientRect();
      const travel = box.height - window.innerHeight;
      const top = window.scrollY + box.top + ((i + 1.5) / STATES) * travel;
      window.scrollTo({ top, behavior: prefersReducedMotion ? "auto" : "smooth" });
    });
  });

  /* G-force chart: the full ascent curve (dashed) + the part already flown (lit).
     Points are [seconds from ignition, G]. Steps sit at the times of each log entry. */
  const gChart = document.querySelector("[data-g-chart]");
  // Profile modelled on a real crewed launch (Falcon 9 + Dragon): max-Q ≈ T+1:12, first-stage cutoff
  // ≈ T+2:30 at ~3 G, a few seconds of near-zero G at separation, second stage builds up again and
  // shuts down ≈ T+8:40 → free fall (what we feel as 0 G).
  const G_CURVE = [[-10, 1], [0, 1.2], [40, 1.4], [72, 1.6], [110, 2.2], [150, 3], [151, 0.15], [156, 0.15],
    [162, 0.9], [220, 1.2], [300, 1.6], [450, 2.4], [515, 2.9], [521, 2.9], [522, 0], [540, 0]];
  const STEP_T = [-10, 0, 72, 150, 220, 522];
  const gx = (t) => 22 + ((t + 10) / 550) * 274;   // time → x (plot from 22 to 296)
  const gy = (g) => 86 - g * 24;                   // G → y (0G = 86, 1G = 62, 3G = 14)
  const pathOf = (pts) => pts.map(([t, g], i) => `${i ? "L" : "M"}${gx(t).toFixed(1)} ${gy(g).toFixed(1)}`).join(" ");
  gChart?.querySelector("[data-g-all]").setAttribute("d", pathOf(G_CURVE));

  function drawG(fill) {
    if (!gChart) return;
    const k = fill * (STEP_T.length - 1);
    const i = Math.min(STEP_T.length - 2, Math.floor(k));
    const t = STEP_T[i] + (STEP_T[i + 1] - STEP_T[i]) * (k - i);
    const pts = G_CURVE.filter(([pt]) => pt <= t);
    const next = G_CURVE.find(([pt]) => pt > t);
    const prev = pts[pts.length - 1];
    if (next) pts.push([t, prev[1] + (next[1] - prev[1]) * ((t - prev[0]) / (next[0] - prev[0]))]);
    const [et, eg] = pts[pts.length - 1];
    gChart.querySelector("[data-g-done]").setAttribute("d", pathOf(pts));
    const dot = gChart.querySelector("[data-g-dot]");
    dot.setAttribute("cx", gx(et).toFixed(1));
    dot.setAttribute("cy", gy(eg).toFixed(1));
  }

  /* Sky keyframes, one per step (dawn on the pad → day → dusk → space).
     Kept dark enough for white text to stay readable at every point. */
  const section = scene;
  const SKY = [
    { top: "#11305a", bottom: "#24507e", glow: [255, 157, 92, 0], stars: 0,    hzW: 520, hzCap: 22 }, // T−00:10 dawn
    { top: "#123563", bottom: "#28598a", glow: [255, 170, 110, 0], stars: 0,   hzW: 500, hzCap: 21 }, // ignition
    { top: "#123f73", bottom: "#235f96", glow: [120, 190, 240, 0.25], stars: 0,   hzW: 380, hzCap: 16 }, // max-Q, day sky
    { top: "#0c1d3a", bottom: "#163961", glow: [94, 200, 242, 0.18], stars: 0.35, hzW: 260, hzCap: 10 }, // separation
    { top: "#0A1428", bottom: "#0f2445", glow: [94, 200, 242, 0.12], stars: 0.8,  hzW: 200, hzCap: 5 },  // edge of space
    { top: "#0A1428", bottom: "#0A1428", glow: [94, 200, 242, 0],    stars: 1,    hzW: 160, hzCap: 0 },  // orbit
  ];
  const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const mix = (a, b, t) => a + (b - a) * t;
  const mixRgb = (a, b, t) => `rgb(${hex(a).map((v, i) => Math.round(mix(v, hex(b)[i], t))).join(" ")})`;

  function paintSky(fill) {
    if (!section) return;
    const k = fill * (SKY.length - 1);
    const i = Math.min(SKY.length - 2, Math.floor(k));
    const t = k - i;
    const a = SKY[i], b = SKY[i + 1];
    const g = a.glow.map((v, n) => mix(v, b.glow[n], t));
    section.style.setProperty("--sky-top", mixRgb(a.top, b.top, t));
    section.style.setProperty("--sky-bottom", mixRgb(a.bottom, b.bottom, t));
    section.style.setProperty("--sky-glow", `rgb(${g[0].toFixed(0)} ${g[1].toFixed(0)} ${g[2].toFixed(0)} / ${g[3].toFixed(2)})`);
    section.style.setProperty("--stars", mix(a.stars, b.stars, t).toFixed(2));
    // Photos: pad (steps 0–1) → stratosphere (2–3) → fade out to space (4–5)
    const clamp01 = (v) => Math.min(1, Math.max(0, v));
    const pad = 1 - clamp01(k - 1.2);              // fades out between 1.2 and 2.2
    const strato = clamp01(k - 1.2) * (1 - clamp01(k - 3)); // in 1.2→2.2, out 3→4
    section.style.setProperty("--photo-pad", pad.toFixed(3));
    section.style.setProperty("--photo-strato", strato.toFixed(3));
    section.style.setProperty("--photo-zoom", (1 + Math.min(k, 4) * 0.02).toFixed(3));
  }

  let ticking = false;
  window.addEventListener(
    "scroll",
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        update();
        ticking = false;
      });
    },
    { passive: true }
  );
  window.addEventListener("resize", update);
  update();
}

/* ---------- Parallax: background drifts slower than the page ---------- */
function setupParallax() {
  const images = [...document.querySelectorAll("[data-parallax]")];
  if (!images.length || prefersReducedMotion) return;
  const RANGE = 8; // % of the image height (the image has 10% spare on each side)

  function update() {
    const vh = window.innerHeight;
    for (const img of images) {
      const box = img.parentElement.getBoundingClientRect();
      if (box.bottom < 0 || box.top > vh) continue;
      // -1 when the section enters from below, +1 when it leaves at the top
      const progress = (vh / 2 - (box.top + box.height / 2)) / (vh / 2 + box.height / 2);
      img.style.setProperty("--parallax", `${(progress * RANGE).toFixed(2)}%`);
    }
  }

  let ticking = false;
  window.addEventListener(
    "scroll",
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        update();
        ticking = false;
      });
    },
    { passive: true }
  );
  window.addEventListener("resize", update);
  update();
}

/* ---------- Quote: words light up one by one while scrolling ---------- */
function setupQuoteWrite() {
  const quote = document.querySelector("[data-quote-write]");
  if (!quote || prefersReducedMotion) return;
  const target = quote.querySelector("p");

  // Wrap each word in a span (spaces stay as text so screen readers read it normally)
  const words = target.textContent.trim().split(/\s+/);
  target.replaceChildren(
    ...words.flatMap((word, i) => {
      const span = document.createElement("span");
      span.className = "quote-word";
      span.textContent = word;
      return i < words.length - 1 ? [span, document.createTextNode(" ")] : [span];
    })
  );
  const spans = [...target.querySelectorAll(".quote-word")];

  function update() {
    const vh = window.innerHeight;
    const box = quote.getBoundingClientRect();
    // 0 when the quote enters at 85% of the screen, 1 when it reaches 40%
    const progress = Math.min(1, Math.max(0, (vh * 0.85 - box.top) / (vh * 0.45)));
    const lit = Math.round(progress * spans.length);
    spans.forEach((s, i) => s.classList.toggle("is-lit", i < lit));
  }

  let ticking = false;
  window.addEventListener(
    "scroll",
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        update();
        ticking = false;
      });
    },
    { passive: true }
  );
  window.addEventListener("resize", update);
  update();
}

/* ---------- Protocol hotspots: one point open at a time ---------- */
function setupHotspots() {
  const root = document.querySelector("[data-hotspots]");
  if (!root) return;
  const spots = [...root.querySelectorAll("[data-hotspot]")];
  const cards = [...root.querySelectorAll("[data-hotspot-card]")];

  function open(n) {
    spots.forEach((s) => {
      const on = s.dataset.hotspot === n;
      s.classList.toggle("is-active", on);
      s.setAttribute("aria-expanded", String(on));
    });
    cards.forEach((c) => c.classList.toggle("is-active", c.dataset.hotspotCard === n));
  }

  spots.forEach((s) => s.addEventListener("click", () => open(s.dataset.hotspot)));
  // Mobile: tapping a card in the list highlights its point on the image
  cards.forEach((c) => c.addEventListener("click", () => open(c.dataset.hotspotCard)));
}

/* ---------- Station modules: large viewer with previous / next ---------- */
function setupModuleViewer() {
  const dialog = document.getElementById("module-viewer");
  const cards = [...document.querySelectorAll("[data-module]")];
  if (!dialog || !cards.length) return;
  const $ = (sel) => dialog.querySelector(sel);
  const img = $("[data-mv-img]");
  let index = 0;

  const modules = cards.map((card) => {
    const thumb = card.querySelector(".module-img");
    return {
      src: thumb.currentSrc ? thumb.src.replace("-800.", "-1400.") : thumb.src,
      alt: thumb.alt,
      code: card.querySelector(".module-code").textContent,
      title: card.querySelector(".module-open").firstChild.textContent.trim(),
      detail: card.dataset.detail,
      facts: card.dataset.facts.split("|").map((f) => f.split(/:(.+)/)),
    };
  });

  function show(i) {
    index = (i + modules.length) % modules.length;
    const m = modules[index];
    img.classList.remove("is-changing");
    void img.offsetWidth; // restart the animation
    img.classList.add("is-changing");
    img.src = m.src.replace("-800.", "-1400.");
    img.alt = m.alt;
    $("[data-mv-code]").textContent = m.code;
    $("[data-mv-title]").textContent = m.title;
    $("[data-mv-detail]").textContent = m.detail;
    $("[data-mv-facts]").replaceChildren(
      ...m.facts.map(([k, v]) => {
        const div = document.createElement("div");
        const dt = document.createElement("dt");
        const dd = document.createElement("dd");
        dt.textContent = k;
        dd.textContent = v;
        div.append(dt, dd);
        return div;
      })
    );
    $("[data-mv-index]").textContent = String(index + 1).padStart(2, "0");
  }

  /* Plan ↔ cards link. One single "lit" index, so only one compartment is ever on:
     hover wins; keyboard focus (focus-visible) lights it when nothing is hovered.
     A focus left by a mouse click (e.g. after closing the viewer) never keeps it lit. */
  const planModules = [...document.querySelectorAll("[data-plan]")];
  let hovered = null;

  // Focus only counts while the user is navigating with Tab (not after clicks or closing the viewer)
  let tabbing = false;
  document.addEventListener("keydown", (e) => { if (e.key === "Tab") tabbing = true; });
  document.addEventListener("pointerdown", () => { tabbing = false; });

  function keyboardFocused() {
    if (!tabbing) return null;
    const i = cards.findIndex((card) => card.contains(document.activeElement));
    return i >= 0 ? i : null;
  }

  function sync() {
    const lit = hovered ?? keyboardFocused();
    planModules.forEach((mod, i) => mod.classList.toggle("is-lit", i === lit));
    cards.forEach((card, i) => card.classList.toggle("is-linked", i === lit && hovered !== null && !card.matches(":hover")));
  }

  const enter = (i) => { hovered = i; sync(); };
  const leave = (i) => { if (hovered === i) hovered = null; sync(); };

  cards.forEach((card, i) => {
    card.addEventListener("pointerenter", () => enter(i));
    card.addEventListener("pointerleave", () => leave(i));
    card.addEventListener("focusin", () => requestAnimationFrame(sync));
    card.addEventListener("focusout", () => requestAnimationFrame(sync));
  });

  // The plan works the other way too: hover a compartment → its card reacts; click → open it
  planModules.forEach((mod, i) => {
    if (!cards[i]) return;
    mod.addEventListener("pointerenter", () => enter(i));
    mod.addEventListener("pointerleave", () => leave(i));
    mod.addEventListener("click", () => cards[i].querySelector("[data-module-open]")?.click());
  });

  // Closing the viewer returns focus to the card button: re-check so nothing stays lit
  dialog.addEventListener("close", () => { hovered = null; tabbing = false; requestAnimationFrame(sync); });

  // Fill the dialog before Bootstrap opens it (our listener runs first)
  document.querySelectorAll("[data-module-open]").forEach((btn) =>
    btn.addEventListener("click", () => show(Number(btn.dataset.moduleOpen)))
  );
  $("[data-mv-prev]").addEventListener("click", () => show(index - 1));
  $("[data-mv-next]").addEventListener("click", () => show(index + 1));
  dialog.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") show(index - 1);
    if (e.key === "ArrowRight") show(index + 1);
  });

  // Swipe on the image (mobile)
  let startX = null;
  img.addEventListener("pointerdown", (e) => (startX = e.clientX));
  img.addEventListener("pointerup", (e) => {
    if (startX === null) return;
    const dx = e.clientX - startX;
    startX = null;
    if (Math.abs(dx) > 50) show(index + (dx < 0 ? 1 : -1));
  });
}

/* ---------- Tickets: mobile mission picker ---------- */
function setupTicketPicker() {
  const picks = [...document.querySelectorAll("[data-pick]")];
  const passes = [...document.querySelectorAll("[data-pass]")];
  if (!picks.length) return;
  function pick(n) {
    picks.forEach((b) => {
      const on = b.dataset.pick === n;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-selected", String(on));
    });
    passes.forEach((p) => p.classList.toggle("is-picked", p.dataset.pass === n));
  }
  picks.forEach((b) => b.addEventListener("click", () => pick(b.dataset.pick)));
  // Arrow keys move between tabs
  picks.forEach((b, i) =>
    b.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const next = picks[(i + (e.key === "ArrowRight" ? 1 : picks.length - 1)) % picks.length];
      next.focus();
      pick(next.dataset.pick);
    })
  );
  // Keep the "T−days" chip in sync with the launch countdown
  const days = document.querySelector("[data-tickets-days]");
  if (days) days.textContent = Math.max(0, Math.floor((LAUNCH_DATE - Date.now()) / 86_400_000));
}

/* ---------- Mobile menu: close drawer after choosing a section ---------- */
function closeMenuOnNavigate() {
  const menu = document.getElementById("site-menu");
  menu.addEventListener("click", (event) => {
    if (!event.target.closest(".nav-link")) return;
    // Reuse Bootstrap's own close button so its state stays in sync
    if (menu.open) menu.querySelector('[data-bs-dismiss="drawer"]').click();
  });
}

/* ---------- Booking dialog ---------- */
function setupBooking() {
  const dialog = document.getElementById("booking");
  if (!dialog) return;
  const form = dialog.querySelector("[data-booking-form]");
  const success = dialog.querySelector("[data-booking-success]");
  const pass = dialog.querySelector("[data-bpass]");
  const header = dialog.querySelector(".booking-header");
  const $ = (sel) => dialog.querySelector(sel);

  // Seats left per mission and window (Mar matches the passes in the tickets section)
  const MISSIONS = {
    explorador: { name: "Explorador", price: 250000, seats: { mar: 4, jun: 6, sep: 6 }, rows: 3 },
    comandante: { name: "Comandante", price: 420000, seats: { mar: 1, jun: 3, sep: 4 }, rows: 2 },
    cupula: { name: "Cúpula Privada", price: 780000, seats: { mar: 2, jun: 2, sep: 2 }, rows: 1 },
  };
  const WINDOWS = {
    mar: { date: "14 MAR 2027", flight: "AND‑214" },
    jun: { date: "20 JUN 2027", flight: "AND‑221" },
    sep: { date: "18 SEP 2027", flight: "AND‑228" },
  };
  const money = (n) => "$" + n.toLocaleString("en-US");

  // Short flash on the pass field that just changed
  function set(el, text) {
    if (!el || el.textContent === text) return;
    el.textContent = text;
    el.classList.remove("is-updated");
    void el.offsetWidth;
    el.classList.add("is-updated");
  }

  // Seat from the name: same name → same seat (feels assigned, not random)
  function seatFor(name, rows) {
    if (!name) return "—";
    let h = 0;
    for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return `${(h % rows) + 1}${"AB"[(h >> 4) % 2]}`;
  }

  function update() {
    const mission = MISSIONS[form.mission.value];
    const win = WINDOWS[form.window.value];
    const name = form.name.value.trim();

    // window chips show the seats left for the chosen mission
    dialog.querySelectorAll("[data-seats]").forEach((el) => {
      const n = mission.seats[el.dataset.seats];
      el.textContent = n === 1 ? "Último lugar" : `Quedan ${n}`;
      el.classList.toggle("is-last", n === 1);
    });

    $('[data-summary="deposit"]').textContent = money(mission.price * 0.1);
    $('[data-summary="total"]').textContent = money(mission.price);

    pass.dataset.mission = form.mission.value;
    const nameEl = $("[data-bpass-name]");
    set(nameEl, name || "Tu nombre aquí");
    nameEl.classList.toggle("is-empty", !name);
    set($("[data-bpass-mission]"), mission.name);
    set($("[data-bpass-date]"), win.date);
    set($("[data-bpass-flight]"), win.flight);
    set($("[data-bpass-seat]"), seatFor(name, mission.rows));
    $("[data-bpass-total]").firstChild.textContent = money(mission.price) + " ";
  }

  form.addEventListener("input", update);
  form.addEventListener("change", update);

  // Header types in like a log entry every time the dialog opens (static with reduced motion)
  const typed = [...dialog.querySelectorAll(".booking-header .eyebrow, .booking-header .booking-title")];
  const typedChars = typed.map((el) => {
    const text = el.textContent.trim();
    el.textContent = "";
    const box = document.createElement("span");
    box.className = "tw-text";
    const chars = [...text].map((ch) => {
      const span = document.createElement("span");
      span.className = "tw-char";
      span.textContent = ch;
      box.append(span);
      return span;
    });
    el.append(box);
    return chars;
  });
  const caret = document.createElement("span");
  caret.className = "tw-caret";
  caret.setAttribute("aria-hidden", "true");
  let typingRun = 0;

  async function typeHeader() {
    const run = ++typingRun;
    const all = typedChars.flat();
    if (prefersReducedMotion) {
      all.forEach((c) => c.classList.add("is-on"));
      all.at(-1).after(caret);
      return;
    }
    all.forEach((c) => c.classList.remove("is-on"));
    caret.classList.add("is-typing");
    for (const [k, chars] of typedChars.entries()) {
      for (const ch of chars) {
        if (run !== typingRun) return;
        ch.classList.add("is-on");
        ch.after(caret);
        await new Promise((r) => setTimeout(r, k === 0 ? 18 : 34));
      }
      await new Promise((r) => setTimeout(r, 160));
    }
    caret.classList.remove("is-typing");
  }

  // Opening: fresh form, mission preselected from the ticket button that opened it
  document.addEventListener("click", (event) => {
    const trigger = event.target.closest('[data-bs-target="#booking"]');
    if (!trigger) return;
    form.reset();
    form.classList.remove("was-submitted");
    if (trigger.dataset.mission) form.mission.value = trigger.dataset.mission;
    form.hidden = false;
    header.hidden = false;
    success.hidden = true;
    pass.classList.remove("is-approved");
    update();
    typeHeader();
  });

  // No backend yet: stamp the pass and show the confirmation
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    form.classList.add("was-submitted");
    if (!form.checkValidity()) {
      form.querySelector(":invalid")?.focus();
      return;
    }
    $("[data-success-email]").textContent = form.email.value.trim();
    form.hidden = true;
    header.hidden = true;
    success.hidden = false;
    pass.classList.add("is-approved");
    success.querySelector("button")?.focus();
  });

  update();
}

/* ---------- Typewriter: section labels and titles type in like a log entry ----------
   Every char is wrapped in a span that starts transparent (opacity keeps the layout
   fixed, so nothing jumps, and screen readers still read the full text).
   In each section the eyebrow types first, then the title; the caret | stays blinking
   at the end of the title. */
function setupTypewriter() {
  const SPEED = { label: 24, title: 42 }; // ms per character
  const PAUSE = 220;                      // ms between the label and the title

  const groups = new Map();
  document.querySelectorAll("section .eyebrow, section h1, section h2").forEach((el) => {
    if (el.closest("dialog") || el.classList.contains("visually-hidden")) return;
    const section = el.closest("section");
    if (!groups.has(section)) groups.set(section, []);
    groups.get(section).push(el);
  });

  // Wrap every visible character in <span class="tw-char">, keeping inner markup (<br>, <em>…)
  function prepare(el) {
    const box = document.createElement("span");
    box.className = "tw-text";
    while (el.firstChild) box.append(el.firstChild);
    el.append(box);
    const chars = [];
    const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const text = node.textContent.replace(/\s+/g, " ");
      const frag = document.createDocumentFragment();
      for (const ch of text) {
        const span = document.createElement("span");
        span.className = "tw-char";
        span.textContent = ch;
        frag.append(span);
        chars.push(span);
      }
      node.replaceWith(frag);
    }
    // no stray spaces at the edges (the caret should sit right after the last letter)
    while (chars.length && chars[0].textContent === " ") chars.shift().remove();
    while (chars.length && chars.at(-1).textContent === " ") chars.pop().remove();
    return chars;
  }

  const makeCaret = () => {
    const caret = document.createElement("span");
    caret.className = "tw-caret";
    caret.setAttribute("aria-hidden", "true");
    return caret;
  };

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  async function typeGroup(items) {
    const caret = makeCaret();
    caret.classList.add("is-typing");
    for (const item of items) {
      const speed = item.el.classList.contains("eyebrow") ? SPEED.label : SPEED.title;
      item.el.classList.add("is-typing");
      for (const ch of item.chars) {
        ch.classList.add("is-on");
        ch.after(caret);
        await wait(ch.textContent === " " ? speed / 2 : speed);
      }
      item.el.classList.remove("is-typing");
      item.el.classList.add("is-typed");
      if (item !== items[items.length - 1]) await wait(PAUSE);
    }
    caret.classList.remove("is-typing");   // now it just blinks at the end of the title
  }

  groups.forEach((els) => {
    const items = els.map((el) => ({ el, chars: prepare(el) }));
    const last = items[items.length - 1];

    if (prefersReducedMotion) {
      items.forEach(({ el, chars }) => {
        el.classList.add("is-typed");
        chars.forEach((c) => c.classList.add("is-on"));
      });
      last.chars[last.chars.length - 1]?.after(makeCaret());
      return;
    }

    items.forEach(({ el }) => el.classList.add("is-waiting"));
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        typeGroup(items);
      },
      { threshold: 0.6 }
    );
    observer.observe(items[0].el);
  });
}

/* ---------- Current section in the navbar (scrollspy) ----------
   The link of the chapter you are reading gets .is-current + aria-current.
   Chapters without a link (hero, reentry, final CTA) clear it. */
function setupScrollSpy() {
  const links = [...document.querySelectorAll('.site-nav .nav-link[href^="#"]')];
  const sections = [...document.querySelectorAll("main > section[id]")];
  if (!links.length || !sections.length) return;

  function mark(id) {
    links.forEach((link) => {
      const on = link.getAttribute("href") === `#${id}`;
      link.classList.toggle("is-current", on);
      if (on) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });
  }

  // A section is "current" when it crosses a thin band at 40% of the viewport
  const observer = new IntersectionObserver(
    (entries) => entries.forEach((e) => e.isIntersecting && mark(e.target.id)),
    { rootMargin: "-40% 0px -59% 0px" }
  );
  sections.forEach((section) => observer.observe(section));
}

/* ---------- Light that follows the cursor on the luxury panels ----------
   Sets --spot-x / --spot-y on the panel under the pointer (mouse / trackpad only) */
function setupSpotlight() {
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  const SELECTOR = ".module-card, .pass, .hotspot-card, .telemetry, .tickets-guarantees, .countdown, " +
    ".module-viewer-facts > div, .orbit-info, .final-panel, .mission-option, .window-option, .booking-summary";
  let lit = null;

  document.addEventListener(
    "pointermove",
    (event) => {
      const panel = event.target.closest(SELECTOR);
      if (lit && lit !== panel) {
        lit.style.removeProperty("--spot-x");
        lit.style.removeProperty("--spot-y");
      }
      lit = panel;
      if (!panel) return;
      const box = panel.getBoundingClientRect();
      panel.style.setProperty("--spot-x", `${Math.round(event.clientX - box.left)}px`);
      panel.style.setProperty("--spot-y", `${Math.round(event.clientY - box.top)}px`);
    },
    { passive: true }
  );
}

/* ---------- Trajectory bar fallback (browsers without scroll-driven animations) ---------- */
function setupTrajectoryFallback() {
  if (CSS.supports("animation-timeline: scroll()")) return;
  const bar = document.querySelector(".nav-progress");
  if (!bar) return;
  let ticking = false;
  const update = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.setProperty("--page-progress", max > 0 ? (window.scrollY / max).toFixed(4) : 0);
    ticking = false;
  };
  window.addEventListener("scroll", () => {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }, { passive: true });
  update();
}

startCountdown();
setupHeroVideo();
revealOnScroll();
setupLaunchSequence();
setupOrbitClock();
setupParallax();
setupQuoteWrite();
setupHotspots();
setupModuleViewer();
setupTicketPicker();
closeMenuOnNavigate();
setupBooking();
setupTypewriter();
setupScrollSpy();
setupSpotlight();
setupTrajectoryFallback();
