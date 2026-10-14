// Ryan Allen portfolio: shared tooltip, case-study contents highlighting,
// and the facility-location demo on the home page.
(function () {
  "use strict";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- Tooltip for anything with data-tip ----------
  var tip = document.createElement("div");
  tip.className = "tip";
  tip.setAttribute("role", "tooltip");
  document.body.appendChild(tip);
  function place(x, y) {
    var w = tip.offsetWidth, h = tip.offsetHeight;
    var left = Math.min(window.innerWidth - w - 8, Math.max(8, x + 14));
    var top = y - h - 12;
    if (top < 8) top = y + 18;
    tip.style.left = left + "px";
    tip.style.top = top + "px";
  }
  function show(el, x, y) {
    tip.textContent = el.getAttribute("data-tip");
    tip.classList.add("show");
    place(x, y);
  }
  function hide() { tip.classList.remove("show"); }
  document.addEventListener("pointerover", function (e) {
    var el = e.target.closest && e.target.closest("[data-tip]");
    if (el) show(el, e.clientX, e.clientY);
  });
  document.addEventListener("pointermove", function (e) {
    var el = e.target.closest && e.target.closest("[data-tip]");
    if (el) place(e.clientX, e.clientY); else hide();
  });
  document.addEventListener("pointerout", function (e) {
    if (!e.relatedTarget || !(e.relatedTarget.closest && e.relatedTarget.closest("[data-tip]"))) hide();
  });
  document.addEventListener("focusin", function (e) {
    var el = e.target.closest && e.target.closest("[data-tip]");
    if (!el) return;
    var r = el.getBoundingClientRect();
    show(el, r.left + r.width / 2, r.top);
  });
  document.addEventListener("focusout", hide);
  window.addEventListener("scroll", hide, { passive: true });

  // ---------- Case study: highlight the section being read ----------
  var tocLinks = document.querySelectorAll(".toc a");
  if (tocLinks.length && "IntersectionObserver" in window) {
    var byId = {};
    tocLinks.forEach(function (a) { byId[a.getAttribute("href").slice(1)] = a; });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          tocLinks.forEach(function (a) { a.classList.remove("on"); });
          var a = byId[en.target.id];
          if (a) a.classList.add("on");
        }
      });
    }, { rootMargin: "-20% 0px -70% 0px" });
    Object.keys(byId).forEach(function (id) { var s = document.getElementById(id); if (s) io.observe(s); });
  }

  // ---------- Click to enlarge screenshots (links still work without JavaScript) ----------
  var viewer = null;
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a.zoom");
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    if (typeof HTMLDialogElement !== "function") return;
    e.preventDefault();
    if (!viewer) {
      viewer = document.createElement("dialog");
      viewer.className = "viewer";
      viewer.setAttribute("aria-label", "Enlarged screenshot");
      viewer.innerHTML = '<button type="button" class="close" aria-label="Close">×</button><img alt=""><p></p>';
      viewer.addEventListener("click", function (ev) { if (ev.target === viewer || ev.target.classList.contains("close")) viewer.close(); });
      document.body.appendChild(viewer);
    }
    var src = a.querySelector("img");
    var big = viewer.querySelector("img");
    big.src = a.getAttribute("href");
    big.alt = src ? src.alt : "";
    viewer.querySelector("p").textContent = src ? src.alt : "";
    viewer.showModal();
  });

  var NS = "http://www.w3.org/2000/svg";
  function el(name, attrs, parent) {
    var n = document.createElementNS(NS, name);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function baseLayers(svg, d) {
    el("path", { d: d.green, class: "m-green" }, svg);
    el("path", { d: d.bld, class: "m-bld" }, svg);
    var minor = el("path", { d: d.roads["3"] || "", class: "m-road" }, svg); minor.setAttribute("stroke-width", "10");
    ["2", "1", "0"].forEach(function (k) {
      if (!d.roads[k]) return;
      var p = el("path", { d: d.roads[k], class: "m-road-major" }, svg);
      p.setAttribute("stroke-width", k === "2" ? "14" : "18");
    });
  }

  // ---------- Lots by today's permit designation (permit-model page and its thumbnail) ----------
  document.querySelectorAll("[data-lotmap]").forEach(function (box) {
    fetch(box.getAttribute("data-lotmap")).then(function (r) { return r.json(); }).then(function (d) {
      var svg = el("svg", { viewBox: box.getAttribute("data-view") || ("0 0 " + d.w + " " + d.h), role: "img",
        "aria-label": box.getAttribute("data-label") || "Campus parking lots colored by permit type" });
      if (box.hasAttribute("data-thumb")) { svg.setAttribute("aria-hidden", "true"); svg.removeAttribute("role"); svg.setAttribute("preserveAspectRatio", "xMidYMid slice"); }
      baseLayers(svg, d);
      d.lots.forEach(function (l) {
        var g = (l.t === "Commuter" || l.t === "Economy") ? "g-c" : (l.t === "Faculty/Staff" ? "g-f" : "g-o");
        var p = el("path", { d: l.d, class: "lot " + g }, svg);
        if (!box.hasAttribute("data-thumb")) {
          var spaces = l.s ? ", about " + l.s.toLocaleString() + " spaces" : "";
          p.setAttribute("data-tip", l.n + ": " + l.t + spaces);
        }
      });
      box.appendChild(svg);
    });
  });

  // ---------- Home: which k parking lots minimize the average walk? ----------
  var host = document.getElementById("solver");
  if (!host) return;
  var say = document.getElementById("solver-say");
  var walkEl = document.getElementById("solver-walk");

  fetch(host.getAttribute("data-src")).then(function (r) { return r.json(); }).then(build).catch(function () {
    host.querySelector(".solver-frame").setAttribute("data-failed", "");
    say.textContent = "The map didn't load. Refresh the page to try again.";
  });

  var MAXK = 6;
  var ORD = ["", "first", "second", "third", "fourth", "fifth", "sixth"];
  var NUM = ["no", "one", "two", "three", "four", "five", "six"];
  function r5(v) { return Math.round(v / 5) * 5; }
  function listNames(a) { return a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]; }

  function build(d) {
    var frame = host.querySelector(".solver-frame");
    var view = (host.getAttribute("data-view") || ("0 0 " + d.w + " " + d.h)).split(" ").map(Number);
    var svg = el("svg", { viewBox: view.join(" "), role: "img",
      "aria-label": "Map of the University of Arkansas campus showing parking lots, the buildings where classes meet, and lines from each building to its nearest open lot." });
    baseLayers(svg, d);

    function inView(o) { return o.x >= view[0] && o.x <= view[0] + view[2] && o.y >= view[1] && o.y <= view[1] + view[3]; }
    var cand = [], lotEls = [];
    d.lots.forEach(function (l) {
      var isCand = l.cand && inView(l);
      var p = el("path", { d: l.d, class: "lot" + (isCand ? " cand" : "") }, svg);
      if (isCand) {
        var spaces = l.s ? "about " + l.s.toLocaleString() + " spaces" : "spaces unknown";
        p.setAttribute("data-tip", l.n + ": " + l.t.toLowerCase() + ", " + spaces);
        p.setAttribute("aria-label", l.n);
        cand.push(l); lotEls.push(p);
      }
    });
    var gLines = el("g", {}, svg);
    var gDem = el("g", {}, svg);
    var dem = d.dem.filter(inView);
    var demEls = dem.map(function (b) {
      var c = el("circle", { cx: b.x, cy: b.y, r: 15, class: "dem" }, gDem);
      c.setAttribute("data-tip", b.n);
      return c;
    });
    var gHub = el("g", {}, svg);

    // scale bar (500 m) and north arrow; map units are metres
    var sb = el("g", { class: "scale", transform: "translate(" + (view[0] + 110) + " " + (view[1] + view[3] - 100) + ")" }, svg);
    el("line", { x1: 0, y1: 0, x2: 500, y2: 0 }, sb);
    el("line", { x1: 0, y1: -24, x2: 0, y2: 0 }, sb);
    el("line", { x1: 500, y1: -24, x2: 500, y2: 0 }, sb);
    var t = el("text", { x: 0, y: -40 }, sb); t.textContent = "500 m";
    var na = el("g", { class: "north", transform: "translate(" + (view[0] + view[2] - 110) + " " + (view[1] + 140) + ")" }, svg);
    el("path", { d: "M0,-70 L28,10 L0,-8 L-28,10 Z" }, na);
    var nt = el("text", { x: 0, y: 72, "text-anchor": "middle" }, na); nt.textContent = "N";

    frame.appendChild(svg);

    // Straight-line distance in metres from candidate lot j to class building i
    var n = cand.length, m = dem.length;
    var D = cand.map(function (l) {
      var row = new Float64Array(m);
      for (var i = 0; i < m; i++) row[i] = Math.hypot(l.x - dem[i].x, l.y - dem[i].y);
      return row;
    });
    function average(S) {
      var tot = 0;
      for (var i = 0; i < m; i++) {
        var b = Infinity;
        for (var s = 0; s < S.length; s++) if (D[S[s]][i] < b) b = D[S[s]][i];
        tot += b;
      }
      return tot / m;
    }

    // Exact p-median by branch and bound. Lots are tried best-first (by their one-lot cost).
    // Bound: every building walks to its nearest lot among the ones still allowed. Bounds only
    // grow as fewer lots remain, so the first one that can't beat the best answer ends the loop.
    var order = cand.map(function (_, j) { return j; });
    var single = order.map(function (j) { var s = 0; for (var i = 0; i < m; i++) s += D[j][i]; return s; });
    order.sort(function (a, b) { return single[a] - single[b]; });
    var suf = new Array(n + 1);
    suf[n] = new Float64Array(m).fill(Infinity);
    for (var p = n - 1; p >= 0; p--) {
      var row = D[order[p]], after = suf[p + 1], here = new Float64Array(m);
      for (var i = 0; i < m; i++) here[i] = row[i] < after[i] ? row[i] : after[i];
      suf[p] = here;
    }
    function solve(k) {
      var bestTot = Infinity, bestSet = null, chosen = [];
      (function search(start, depth, cur) {
        var i;
        if (depth === k) {
          var s = 0;
          for (i = 0; i < m; i++) s += cur[i];
          if (s < bestTot - 1e-9) { bestTot = s; bestSet = chosen.slice(); }
          return;
        }
        for (var q = start; q <= n - (k - depth); q++) {
          var bound = 0, sq = suf[q];
          for (i = 0; i < m; i++) bound += cur[i] < sq[i] ? cur[i] : sq[i];
          if (bound >= bestTot - 1e-9) break;
          var r = D[order[q]], next = new Float64Array(m);
          for (i = 0; i < m; i++) next[i] = cur[i] < r[i] ? cur[i] : r[i];
          chosen.push(order[q]);
          search(q + 1, depth + 1, next);
          chosen.pop();
        }
      })(0, 0, new Float64Array(m).fill(Infinity));
      return { S: bestSet, avg: bestTot / m };
    }
    var best = [null];
    for (var kk = 1; kk <= MAXK; kk++) best.push(solve(kk));

    var state = { k: 3, mode: "solver", mine: [], timer: null };
    var anim = [], lastLot = dem.map(function () { return -1; });

    // Draw walk lines from each building to its nearest open lot. Only lines that change are animated.
    function draw(S, animate) {
      anim.forEach(function (a) { a.cancel(); }); anim = [];
      while (gLines.firstChild) gLines.removeChild(gLines.firstChild);
      while (gHub.firstChild) gHub.removeChild(gHub.firstChild);
      lotEls.forEach(function (p, j) {
        var on = S.indexOf(j) >= 0;
        p.classList.toggle("open", on);
        if (state.mode === "pick") p.setAttribute("aria-checked", on ? "true" : "false");
      });
      dem.forEach(function (b, i) {
        if (!S.length) { demEls[i].setAttribute("data-tip", b.n); lastLot[i] = -1; return; }
        var bj = S[0];
        S.forEach(function (j) { if (D[j][i] < D[bj][i]) bj = j; });
        var l = cand[bj], len = D[bj][i];
        demEls[i].setAttribute("data-tip", b.n + ": " + r5(len) + " m to " + l.n);
        var line = el("line", { x1: l.x, y1: l.y, x2: b.x, y2: b.y, class: "assign" }, gLines);
        if (animate && !reduce && line.animate && lastLot[i] !== bj) {
          line.setAttribute("stroke-dasharray", len + " " + len);
          anim.push(line.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }],
            { duration: 520, delay: Math.min(420, len * 0.35), easing: "cubic-bezier(.2,.7,.2,1)", fill: "both" }));
        }
        lastLot[i] = bj;
      });
      S.forEach(function (j) { el("circle", { cx: cand[j].x, cy: cand[j].y, r: 30, class: "hub" }, gHub); });
    }

    function names(S) {
      return S.map(function (j) { return cand[j].n; }).sort(function (a, b) { return a.localeCompare(b, "en", { numeric: true }); });
    }
    function showSolver() {
      var k = state.k, sol = best[k];
      walkEl.textContent = r5(sol.avg) + " m";
      var text = "Opens " + listNames(names(sol.S)) + ". ";
      if (k < MAXK) text += "A " + ORD[k + 1] + " lot would save another " + r5(sol.avg - best[k + 1].avg) + " m.";
      else text += "Going from five lots to six saves only " + r5(best[5].avg - sol.avg) + " m.";
      say.textContent = text;
    }
    function showPick(note) {
      var c = state.mine.length, lead = note ? note + " " : "";
      if (!c) {
        walkEl.textContent = "–";
        say.textContent = lead + "Select lots on the map to open them, up to six, and see how close you get to the best layout.";
        return;
      }
      var mine = average(state.mine), opt = best[c].avg;
      var what = c === 1 ? "single lot" : NUM[c] + " lots";
      walkEl.textContent = r5(mine) + " m";
      if (mine - opt < 1e-6) { say.textContent = lead + "You found the best " + what + ": " + r5(opt) + " m."; return; }
      var tie = r5(mine) === r5(opt);
      var a = tie ? Math.round(mine) : r5(mine), b = tie ? Math.round(opt) : r5(opt);
      var pct = Math.round((mine / opt - 1) * 100);
      say.textContent = lead + "Your " + (c === 1 ? "lot" : NUM[c] + " lots") + ": " + a + " m. The best " + what + ": " + b + " m, so yours is " +
        (pct < 1 ? "less than 1%" : pct + "%") + " longer.";
    }

    // Average walk by number of lots: one bar per k, drawn at the panel's real width so text stays legible
    var curve = document.getElementById("solver-curve");
    function drawCurve() {
      var W = Math.max(260, Math.round(curve.clientWidth || 300)), H = 132;
      var padL = 46, padR = 10, padT = 24, padB = 24;
      var pick = state.mode === "pick" ? state.mine.length : 0;
      var mine = pick ? average(state.mine) : 0;
      var top = Math.max(500, Math.ceil(mine / 100) * 100);
      var x0 = padL, x1 = W - padR, band = (x1 - x0) / MAXK, bw = Math.min(24, band * 0.5);
      function y(v) { return padT + (H - padT - padB) * (1 - v / top); }
      var sel = state.mode === "pick" ? pick : state.k;
      var label = "Best average walk by number of lots: " + best.slice(1).map(function (s, i) {
        return (i + 1) + (i ? " lots " : " lot ") + r5(s.avg) + " m"; }).join(", ") + (pick ? ". Your " + pick + ": " + r5(mine) + " m." : ".");
      var s = el("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": label });
      var cap = el("text", { x: 0, y: 12, class: "ttl" }, s); cap.textContent = "Best average walk by number of lots";
      [0, top / 2, top].forEach(function (g) {
        el("line", { x1: x0, x2: x1, y1: y(g), y2: y(g), class: g ? "grid" : "base" }, s);
        var tk = el("text", { x: x0 - 8, y: y(g) + 4, "text-anchor": "end", class: "tick" }, s);
        tk.textContent = g ? g + " m" : "0";
      });
      best.slice(1).forEach(function (sol, i) {
        var k = i + 1, cx = x0 + band * (i + 0.5), yt = y(sol.avg), yb = y(0), x = cx - bw / 2, r = 4;
        el("path", { d: "M" + x + " " + yb + "V" + (yt + r) + "Q" + x + " " + yt + " " + (x + r) + " " + yt + "H" + (x + bw - r) +
          "Q" + (x + bw) + " " + yt + " " + (x + bw) + " " + (yt + r) + "V" + yb + "Z", class: "bar" + (k === sel ? " on" : "") }, s);
        var kt = el("text", { x: cx, y: H - 6, "text-anchor": "middle", class: "tick" + (k === sel ? " sel" : "") }, s);
        kt.textContent = k;
        if (k === sel && !pick) { var vt = el("text", { x: cx, y: yt - 7, "text-anchor": "middle", class: "val" }, s); vt.textContent = r5(sol.avg) + " m"; }
        var hit = el("rect", { x: cx - band / 2, y: padT - 6, width: band, height: H - padT + 6, class: "hit" }, s);
        hit.setAttribute("data-tip", k + (k === 1 ? " lot" : " lots") + ": best average walk " + r5(sol.avg) + " m");
        hit.addEventListener("click", function () { stop(); choose(k, true); });
      });
      if (pick && pick <= MAXK) {
        var cx2 = x0 + band * (pick - 0.5), ym = y(mine), yo = y(best[pick].avg);
        if (yo - ym > 1) el("line", { x1: cx2, x2: cx2, y1: yo, y2: ym, class: "gap" }, s);
        el("circle", { cx: cx2, cy: ym, r: 5, class: "you" }, s);
        var right = cx2 + 60 < W;
        var yl = el("text", { x: right ? cx2 + 10 : cx2 - 10, y: ym + 4, "text-anchor": right ? "start" : "end", class: "val" }, s);
        yl.textContent = "You";
      }
      curve.textContent = "";
      curve.appendChild(s);
    }

    var kbtns = host.querySelectorAll(".kpick button");
    function setButtons() {
      kbtns.forEach(function (b) {
        var k = +b.getAttribute("data-k");
        b.setAttribute("aria-checked", state.mode === "solver" && k === state.k ? "true" : "false");
        b.tabIndex = k === state.k ? 0 : -1;
      });
    }
    function choose(k, animate) {
      if (state.mode === "pick") leavePick();
      state.k = k;
      setButtons();
      draw(best[k].S, animate);
      showSolver();
      drawCurve();
    }

    // Pick your own lots
    var pickBtn = document.getElementById("solver-pick");
    function enterPick() {
      stop();
      state.mode = "pick"; state.mine = [];
      host.classList.add("picking");
      lotEls.forEach(function (p) { p.setAttribute("tabindex", "0"); p.setAttribute("role", "checkbox"); p.setAttribute("aria-checked", "false"); });
      pickBtn.textContent = "Show the best lots";
      setButtons();
      draw([], false); showPick(); drawCurve();
    }
    function leavePick() {
      state.mode = "solver";
      host.classList.remove("picking");
      lotEls.forEach(function (p) { p.removeAttribute("tabindex"); p.removeAttribute("role"); p.removeAttribute("aria-checked"); });
      pickBtn.textContent = "Pick your own lots";
    }
    pickBtn.addEventListener("click", function () {
      if (state.mode !== "pick") { enterPick(); return; }
      var c = state.mine.length;
      choose(c >= 1 && c <= MAXK ? c : state.k, true);
    });
    function toggle(j) {
      var at = state.mine.indexOf(j), note = "";
      if (at >= 0) state.mine.splice(at, 1);
      else if (state.mine.length >= MAXK) note = "Six lots is the limit here. Close one first.";
      else state.mine.push(j);
      draw(state.mine, true); showPick(note); drawCurve();
    }
    // A click on a lot opens that lot; a click near one snaps to the nearest, so small lots are easy to hit on a phone.
    svg.addEventListener("click", function (e) {
      if (state.mode !== "pick") return;
      var j = lotEls.indexOf(e.target);
      if (j < 0) {
        var ctm = svg.getScreenCTM();
        if (!ctm) return;
        var pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
        var q = pt.matrixTransform(ctm.inverse()), bd = 170;
        cand.forEach(function (l, jj) { var dd = Math.hypot(l.x - q.x, l.y - q.y); if (dd < bd) { bd = dd; j = jj; } });
      }
      if (j >= 0) toggle(j);
    });
    lotEls.forEach(function (p, j) {
      p.addEventListener("keydown", function (e) {
        if (state.mode === "pick" && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); toggle(j); }
      });
    });

    // Play: open one lot at a time, from one to six
    var playBtn = document.getElementById("solver-play");
    function stop() {
      if (state.timer) { clearInterval(state.timer); state.timer = null; }
      playBtn.classList.remove("on");
      playBtn.setAttribute("aria-label", "Play: open one lot at a time");
    }
    function play() {
      var k = 1;
      choose(k, true);
      playBtn.classList.add("on");
      playBtn.setAttribute("aria-label", "Pause");
      state.timer = setInterval(function () {
        choose(++k, true);
        if (k >= MAXK) stop();
      }, reduce ? 1800 : 1400);
    }
    playBtn.addEventListener("click", function () { if (state.timer) stop(); else play(); });

    kbtns.forEach(function (b, i) {
      b.addEventListener("click", function () { stop(); choose(+b.getAttribute("data-k"), true); });
      b.addEventListener("keydown", function (e) {
        var nb = null;
        if (e.key === "ArrowRight" || e.key === "ArrowDown") nb = kbtns[(i + 1) % kbtns.length];
        if (e.key === "ArrowLeft" || e.key === "ArrowUp") nb = kbtns[(i - 1 + kbtns.length) % kbtns.length];
        if (nb) { e.preventDefault(); stop(); choose(+nb.getAttribute("data-k"), true); nb.focus(); }
      });
    });

    var resizeQueued = false;
    window.addEventListener("resize", function () {
      if (resizeQueued) return;
      resizeQueued = true;
      requestAnimationFrame(function () { resizeQueued = false; drawCurve(); });
    });

    var start = host.querySelector('.kpick button[aria-checked="true"]');
    choose(start ? +start.getAttribute("data-k") : 3, true);
  }
})();
