/* Model explainer: the token grid, the mask, noise, ten flow steps, decoded futures, other tasks.
   A schematic (the curves are drawn, not model outputs). Mounts into #mx; window.__mx.seek(t) renders time t (teaser capture). */
(function () {
  const root = document.getElementById("mx");
  if (!root) return;
  const NS = "http://www.w3.org/2000/svg";
  const C = { L: "#ed73b8", R: "#4dadfa", O: "#ff942e", ink: "#29271f", ink2: "#5c5547", muted: "#8b8270", line: "#ddd5c2", soft: "#e8eecb", softLine: "#cbd89f", stage: "#1e2318", acc: "#6b8e23", paper: "#faf7ef" };
  const COLS = 20, ROWS = ["L", "R", "O"], NAMES = { L: "Left hand", R: "Right hand", O: "Object" };
  const TASKS = [
    { name: "Forecast", m: { L: [0, 1], R: [0, 1], O: [0, 1] } },
    { name: "Hands → object", m: { L: "all", R: "all", O: [0] } },
    { name: "Object → hands", m: { L: [0], R: [0], O: "all" } },
    { name: "Infill", m: { L: "ends7", R: "ends7", O: "ends7" } },
    { name: "Goal", m: { L: [0, 19], R: [0, 19], O: [0, 19] } },
    { name: "Goal for the hands", m: { L: [0, 19], R: [0, 19], O: [0] } },
    { name: "Goal for the object", m: { L: [0], R: [0], O: [0, 19] } },
  ];
  const given = (task, row, c) => { const s = TASKS[task].m[row]; if (s === "all") return true; if (s === "ends7") return c < 7 || c > 13; return s.includes(c); };
  // ---------------------------------------------------------------- schematic trajectories (2D: x right, y down, panel units 0..1)
  function rng(seed) { let x = seed >>> 0 || 1; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; }; }
  const tObs = 1 / 19;
  function futurePath(f) {
    // object: shared start, then a Hermite curve to a future-specific end point; hands follow (right holds it, left braces)
    const r = rng(101 + 37 * f), p0 = [0.22, 0.62], v0 = [0.55, -0.35];
    const ang = [-0.25, 0.55, -0.85][f % 3] + (r() - 0.5) * 0.2, len = 0.55 + 0.1 * r();
    const pe = [p0[0] + len * Math.cos(ang) + 0.08, p0[1] + len * Math.sin(ang) - 0.05];
    const pa = [p0[0] + v0[0] * tObs, p0[1] + v0[1] * tObs];
    const obj = [];
    for (let c = 0; c < COLS; c++) {
      const t = c / (COLS - 1);
      if (t <= tObs) { obj.push([p0[0] + v0[0] * t, p0[1] + v0[1] * t]); continue; }
      const s = (t - tObs) / (1 - tObs), h00 = 2 * s ** 3 - 3 * s ** 2 + 1, h10 = s ** 3 - 2 * s ** 2 + s, h01 = -2 * s ** 3 + 3 * s ** 2;
      const m0 = [v0[0] * (1 - tObs), v0[1] * (1 - tObs)];
      obj.push([h00 * pa[0] + h10 * m0[0] + h01 * pe[0], h00 * pa[1] + h10 * m0[1] + h01 * pe[1]]);
    }
    const R = obj.map(([x, y], c) => [x - 0.07 + 0.01 * Math.sin(c * 0.5 + f), y + 0.06]);
    const L = obj.map(([x, y], c) => [0.16 + 0.04 * Math.sin(c / 6 + f) + 0.12 * (x - 0.22), 0.80 - 0.05 * Math.cos(c / 5) + 0.05 * (y - 0.62)]);
    return { O: obj, R, L };
  }
  const FUT = [0, 1, 2].map(futurePath);
  // each grid row shows one coordinate of its entity over time (the object and right hand move sideways, the left hand
  // less), scaled per row over the three futures so the motion fills the row
  const SIG = { O: p => -p[0], R: p => -p[0], L: p => p[1] };
  const RANGE = {};
  ROWS.forEach(r => { const v = FUT.flatMap(f => f[r].map(SIG[r])); RANGE[r] = [Math.min(...v), Math.max(...v)]; });
  const rowSignal = (path, row, c) => { const [lo, hi] = RANGE[row], x = (SIG[row](path[row][c]) - lo) / Math.max(1e-6, hi - lo); return row === "L" ? 0.3 + 0.4 * x : 0.1 + 0.8 * x; };
  // ---------------------------------------------------------------- DOM
  const el = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
  root.innerHTML = `<div class="mx-cap"><span class="mx-n" id="mxN">1 / 7</span><span class="mx-t" id="mxT"></span></div><div class="mx-svg"></div>
    <div class="mx-bar"><button class="mx-play" id="mxPlay" aria-label="Pause"><svg viewBox="0 0 12 12"><rect x="1.5" y="1" width="3" height="10" rx="1"/><rect x="7.5" y="1" width="3" height="10" rx="1"/></svg></button><div class="mx-dots" id="mxDots" role="group" aria-label="Step"></div><div class="mx-tasks" id="mxTasks" role="group" aria-label="Task"></div></div>`;
  const svg = el("svg", { viewBox: "0 0 1000 380", role: "img", "aria-label": "How the model fills in the grid" }, root.querySelector(".mx-svg"));
  // grid
  const GX = 128, GY = 52, CW = 19, CG = 2.6, RH = 66, RG = 20;
  const rowY = i => GY + 34 + i * (RH + RG);
  el("text", { x: GX, y: GY + 6, class: "mx-lab" }, svg).textContent = "0 s";
  el("text", { x: GX + COLS * (CW + CG) - CG, y: GY + 6, class: "mx-lab", "text-anchor": "end" }, svg).textContent = "5 s";
  el("text", { x: GX + (COLS * (CW + CG)) / 2, y: GY + 6, class: "mx-lab", "text-anchor": "middle" }, svg).textContent = "time →";
  const cells = {}, dots = {}, lines = {}, noise = {};
  ROWS.forEach((r, i) => {
    const y = rowY(i);
    const lab = el("text", { x: GX - 14, y: y + RH / 2 + 4, class: "mx-row", "text-anchor": "end" }, svg); lab.textContent = NAMES[r];
    cells[r] = []; dots[r] = []; noise[r] = [];
    for (let c = 0; c < COLS; c++) cells[r].push(el("rect", { x: GX + c * (CW + CG), y, width: CW, height: RH, rx: 4.5, class: "mx-cell" }, svg));
    lines[r] = el("polyline", { fill: "none", stroke: C[r], "stroke-width": 2.4, "stroke-linecap": "round", "stroke-linejoin": "round" }, svg);
    for (let c = 0; c < COLS; c++) dots[r].push(el("circle", { r: 3.4, fill: C[r] }, svg));
  });
  const nowLine = el("line", { y1: GY + 18, y2: rowY(2) + RH + 8, stroke: C.ink2, "stroke-width": 1.2, "stroke-dasharray": "3 4", opacity: 0 }, svg);
  // model block + arrows
  const MX = 600, MY = 112, MW = 150, MH = 150;
  const arrowIn = el("path", { d: `M ${GX + COLS * (CW + CG) + 6} ${MY + 50} C ${MX - 30} ${MY + 50}, ${MX - 30} ${MY + 50}, ${MX - 6} ${MY + 50}`, class: "mx-arrow", "marker-end": "url(#mxHead)" }, svg);
  const defs = el("defs", {}, svg);
  const mk = el("marker", { id: "mxHead", viewBox: "0 0 10 10", refX: 8, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" }, defs);
  el("path", { d: "M 0 0 L 10 5 L 0 10 z", fill: C.ink2 }, mk);
  const box = el("rect", { x: MX, y: MY, width: MW, height: MH, rx: 14, fill: C.stage }, svg);
  el("text", { x: MX + MW / 2, y: MY + 30, class: "mx-mt", "text-anchor": "middle" }, svg).textContent = "Transformer";
  el("text", { x: MX + MW / 2, y: MY + 47, class: "mx-ms", "text-anchor": "middle" }, svg).textContent = "12 blocks";
  const att = [];
  for (let a = 0; a < 5; a++) for (let b = 0; b < 8; b++) att.push(el("rect", { x: MX + 27 + b * 12.4, y: MY + 66 + a * 12.4, width: 9, height: 9, rx: 2, fill: "#3a4329" }, svg));
  const stepTxt = el("text", { x: MX + MW / 2, y: MY + MH + 26, class: "mx-step", "text-anchor": "middle" }, svg);
  const arrowBack = el("path", { d: `M ${MX + MW / 2} ${MY + MH + 36} C ${MX + MW / 2} ${GY + 330}, ${GX + 220} ${GY + 330}, ${GX + 220} ${rowY(2) + RH + 10}`, class: "mx-arrow", "marker-end": "url(#mxHead)" }, svg);
  const backTxt = el("text", { x: MX - 120, y: GY + 322, class: "mx-lab", "text-anchor": "middle" }, svg); backTxt.textContent = "move the noise a step";
  const inTxt = el("text", { x: (GX + COLS * (CW + CG) + MX) / 2, y: MY + 40, class: "mx-lab", "text-anchor": "middle" }, svg); inTxt.textContent = "grid";
  // futures panel
  const PX = 790, PY = 52, PW = 190, PH = 300;
  el("rect", { x: PX, y: PY, width: PW, height: PH, rx: 14, fill: "#f4efe3", stroke: C.line }, svg);
  el("text", { x: PX + 14, y: PY + 24, class: "mx-lab" }, svg).textContent = "Decoded motion";
  const arrowOut = el("path", { d: `M ${MX + MW + 6} ${MY + 75} L ${PX - 8} ${MY + 75}`, class: "mx-arrow", "marker-end": "url(#mxHead)" }, svg);
  const toP = ([x, y]) => [PX + 18 + x * (PW - 36), PY + 40 + y * (PH - 60)];
  const fpaths = [0, 1, 2].map(f => ({ O: el("path", { fill: "none", stroke: C.O, "stroke-width": 3, "stroke-linecap": "round", opacity: 0 }, svg), R: el("path", { fill: "none", stroke: C.R, "stroke-width": 2, "stroke-linecap": "round", opacity: 0 }, svg), L: el("path", { fill: "none", stroke: C.L, "stroke-width": 2, "stroke-linecap": "round", opacity: 0 }, svg) }));
  const obsPath = el("path", { fill: "none", stroke: C.ink2, "stroke-width": 3, "stroke-linecap": "round", opacity: 0 }, svg);
  const gObj = el("circle", { r: 8, fill: C.O, stroke: "#fff", "stroke-width": 2, opacity: 0 }, svg), gR = el("circle", { r: 5.5, fill: C.R, stroke: "#fff", "stroke-width": 1.5, opacity: 0 }, svg), gL = el("circle", { r: 5.5, fill: C.L, stroke: "#fff", "stroke-width": 1.5, opacity: 0 }, svg);
  const futLab = el("text", { x: PX + PW - 14, y: PY + PH - 14, class: "mx-lab", "text-anchor": "end" }, svg);
  // ---------------------------------------------------------------- timeline
  const STEPS = [
    { d: 3.0, cap: "A clip becomes a grid: one row for each hand and the object, one column for each moment." },
    { d: 3.0, cap: "The task decides which cells the model gets. For a forecast, that is the first half second." },
    { d: 2.4, cap: "Every other cell starts as random noise." },
    { d: 5.4, cap: "At each step the transformer predicts which way to move the noise. Ten steps turn it into motion." },
    { d: 3.4, cap: "The finished grid is decoded into motion of both hands and the object." },
    { d: 5.0, cap: "Start again from new noise and you get a different future. The model draws 20." },
    { d: 6 * 1.9, cap: "Change which cells are given, and the same model answers a different question." },
  ];
  const starts = []; let tot = 0; STEPS.forEach(s => { starts.push(tot); tot += s.d; });
  const ease = x => x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x);
  const noiseOf = (seed, r, c) => { const x = Math.sin(seed * 12.9898 + ROWS.indexOf(r) * 78.233 + c * 37.719) * 43758.5453; return 0.08 + 0.84 * (x - Math.floor(x)); };
  const yOf = (i, v) => rowY(i) + 8 + v * (RH - 16);
  const pathD = pts => pts.map((p, k) => (k ? "L" : "M") + toP(p).map(v => v.toFixed(1)).join(" ")).join(" ");
  function state(t) {
    t = ((t % tot) + tot) % tot;
    let s = 0; while (s + 1 < STEPS.length && t >= starts[s + 1]) s++;
    return { s, u: (t - starts[s]) / STEPS[s].d, t };
  }
  // tau: progress along the straight noise->data path (flow matching), stepped like Euler's method
  const stepped = (u, n) => Math.min(n, Math.floor(u * n + 1e-6)) / n;
  function draw(t) {
    const { s, u } = state(t);
    let task = 0, fut = 0, tau = 0, maskOn = 0, showNoise = 0, fullCurve = 0, decode = 0, futShown = 0, stepK = -1, pulse = 0;
    if (s === 0) { fullCurve = ease(u * 1.6); }
    if (s === 1) { fullCurve = 1; maskOn = ease(u * 2); }
    if (s === 2) { maskOn = 1; showNoise = ease(u * 2); }
    if (s === 3) { maskOn = 1; showNoise = 1; const uu = Math.min(1, u * 1.06); tau = stepped(uu, 10); stepK = Math.min(10, Math.floor(uu * 10 + 1e-6)); pulse = (uu * 10) % 1; }
    if (s === 4) { maskOn = 1; showNoise = 1; tau = 1; decode = ease(u * 1.3); futShown = 1; stepK = 10; }
    if (s === 5) { maskOn = 1; showNoise = 1; const k = Math.min(1, Math.floor(u * 2)); fut = 1 + k; const uu = Math.min(1, (u * 2 - k) * 1.5); tau = stepped(uu, 10); stepK = Math.round(tau * 10); pulse = (uu * 10) % 1; decode = 1; futShown = 1 + k + (uu >= 1 ? 1 : 0); }
    if (s === 6) { maskOn = 1; showNoise = 1; const k = Math.min(5, Math.floor(u * 6)); task = 1 + k; const uu = Math.min(1, (u * 6 - k) * 1.6); tau = stepped(uu, 10); stepK = Math.round(tau * 10); pulse = (uu * 10) % 1; decode = 0; futShown = 3; }
    const path = FUT[fut], seed = s === 6 ? 50 + task : fut + 1;
    // cells and curves
    ROWS.forEach((r, i) => {
      const pts = [];
      for (let c = 0; c < COLS; c++) {
        const g = given(task, r, c), target = rowSignal(path, r, c);
        const masked = !g && maskOn > 0;
        const cell = cells[r][c];
        cell.setAttribute("class", "mx-cell" + (maskOn > 0 ? (g ? " mx-given" : " mx-masked") : ""));
        cell.style.opacity = masked ? 0.35 + 0.65 * maskOn : 1;
        let v = target, op = 1;
        if (!g && maskOn > 0) {
          if (s === 1) { op = 1 - maskOn; }
          else { const nz = noiseOf(seed, r, c); v = (1 - tau) * nz + tau * target; op = showNoise; }
        } else if (s === 0) { op = c / (COLS - 1) <= fullCurve ? 1 : 0; }
        const d = dots[r][c]; d.setAttribute("cx", GX + c * (CW + CG) + CW / 2); d.setAttribute("cy", yOf(i, v)); d.style.opacity = op;
        d.setAttribute("fill", g && maskOn > 0 ? "#f0ebdf" : C[r]); d.setAttribute("r", g && maskOn > 0 ? 3 : 3.4);
        pts.push([GX + c * (CW + CG) + CW / 2, yOf(i, v), op, g && maskOn > 0]);
      }
      // the line: drawn through the given cells and, once the noise has resolved enough, through the predicted ones
      const lineOp = s === 0 ? 1 : s === 1 ? 1 : Math.max(0, (tau - 0.5) * 2);
      const vis = pts.filter((p, c) => (s <= 1 ? p[2] > 0.5 : true));
      lines[r].setAttribute("points", vis.map(p => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" "));
      lines[r].style.opacity = s === 0 ? 0.9 : s === 1 ? 0.9 * (1 - maskOn) + 0.0 : 0.85 * lineOp;
    });
    const firstHidden = (() => { for (let c = 0; c < COLS; c++) if (!given(task, "O", c) || !given(task, "R", c)) return c; return COLS; })();
    const nx = GX + firstHidden * (CW + CG) - CG / 2;
    nowLine.setAttribute("x1", nx); nowLine.setAttribute("x2", nx); nowLine.style.opacity = task === 0 && maskOn > 0 ? 0.7 * maskOn : 0;
    // model block
    const active = stepK >= 0 && (s === 3 || s === 5 || s === 6) && tau < 1;
    box.setAttribute("fill", active ? "#262e1b" : C.stage);
    att.forEach((a, k) => { const on = active && rng(k * 7 + Math.floor(pulse * 4) + 13 * stepK)() > 0.55; a.setAttribute("fill", on ? "#9fb85a" : "#3a4329"); });
    stepTxt.textContent = stepK >= 0 && s >= 3 ? `step ${Math.max(stepK, 0)} of 10` : "";
    [arrowIn, arrowBack, backTxt, inTxt].forEach(e => e.style.opacity = s >= 3 ? (active ? 1 : 0.35) : 0.15);
    arrowOut.style.opacity = s >= 4 ? 1 : 0.15;
    // decoded futures
    obsPath.setAttribute("d", pathD(FUT[0].O.slice(0, 2)));
    obsPath.style.opacity = s >= 4 && s < 6 ? 1 : 0;
    fpaths.forEach((fp, f) => {
      const shown = s >= 4 && s < 6 && f < futShown;
      const cut = f === fut && s === 4 ? decode : 1;
      const n = Math.max(2, Math.round(cut * (COLS - 1)) + 1);
      ["O", "R", "L"].forEach(r => { fp[r].setAttribute("d", pathD(FUT[f][r].slice(1, n))); fp[r].style.opacity = shown ? (f === fut ? 1 : 0.35) * (r === "O" ? 1 : 0.8) : 0; });
    });
    if (s === 4) {
      const n = s === 4 ? decode * (COLS - 1) : COLS - 1, a = Math.floor(n), b = Math.min(COLS - 1, a + 1), w = n - a;
      const at = rr => { const p = FUT[fut][rr][a], q = FUT[fut][rr][b]; return toP([p[0] + (q[0] - p[0]) * w, p[1] + (q[1] - p[1]) * w]); };
      [[gObj, "O"], [gR, "R"], [gL, "L"]].forEach(([g, rr]) => { const [x, y] = at(rr); g.setAttribute("cx", x); g.setAttribute("cy", y); g.style.opacity = 1; });
      futLab.textContent = "future 1";
    } else { [gObj, gR, gL].forEach(g => g.style.opacity = 0); futLab.textContent = s === 5 ? `${Math.min(futShown, 3)} futures` : ""; }
    // captions + controls
    capN.textContent = `${s + 1} / ${STEPS.length}`;
    const cap = STEPS[s].cap + (s === 6 ? ` <b>${TASKS[task].name}</b>.` : "");
    if (capT.dataset.s !== String(s) || (s === 6 && capT.dataset.task !== String(task))) { capT.innerHTML = cap; capT.dataset.s = String(s); capT.dataset.task = String(task); }
    dotsEl.querySelectorAll("button").forEach((b, k) => b.setAttribute("aria-pressed", k === s ? "true" : "false"));
    tasksEl.querySelectorAll("button").forEach((b, k) => b.setAttribute("aria-pressed", (s === 6 ? k === task : k === 0) ? "true" : "false"));
  }
  const capN = root.querySelector("#mxN"), capT = root.querySelector("#mxT"), dotsEl = root.querySelector("#mxDots"), tasksEl = root.querySelector("#mxTasks"), playB = root.querySelector("#mxPlay");
  let clock = 0, playing = !window.matchMedia("(prefers-reduced-motion: reduce)").matches, seen = false, last = null;
  STEPS.forEach((st, k) => { const b = document.createElement("button"); b.setAttribute("aria-label", `Step ${k + 1}`); b.addEventListener("click", () => { clock = starts[k] + 0.001; draw(clock); }); dotsEl.appendChild(b); });
  TASKS.forEach((tk, k) => { const b = document.createElement("button"); b.textContent = tk.name; b.addEventListener("click", () => { clock = k === 0 ? starts[3] : starts[6] + (k - 1) * 1.9 + 0.001; playing = true; setPlay(); draw(clock); }); tasksEl.appendChild(b); });
  function setPlay() { playB.setAttribute("aria-label", playing ? "Pause" : "Play"); playB.querySelector("svg").innerHTML = playing ? '<rect x="1.5" y="1" width="3" height="10" rx="1"/><rect x="7.5" y="1" width="3" height="10" rx="1"/>' : '<path d="M2 1 L11 6 L2 11 Z"/>'; }
  playB.addEventListener("click", () => { playing = !playing; setPlay(); });
  setPlay();
  new IntersectionObserver(es => es.forEach(e => { seen = e.isIntersecting; }), { threshold: 0.2 }).observe(root);
  const capture = new URLSearchParams(location.search).has("capture");
  function tick(ts) {
    if (last === null) last = ts;
    const dt = Math.min(0.1, (ts - last) / 1000); last = ts;
    if (playing && seen && !capture) { clock += dt; draw(clock); }
    requestAnimationFrame(tick);
  }
  draw(playing ? 0 : starts[4] + STEPS[4].d * 0.99);
  requestAnimationFrame(tick);
  window.__mx = { seek: t => { clock = t; draw(t); return true; }, duration: tot, steps: STEPS.map((s, k) => ({ start: starts[k], d: s.d })) };
})();
