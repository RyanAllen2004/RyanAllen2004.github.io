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

  // ---------- Home: choose k parking lots, minimize the average walk ----------
  var host = document.getElementById("solver");
  if (!host) return;

  fetch(host.getAttribute("data-src")).then(function (r) { return r.json(); }).then(build).catch(function () {
    host.querySelector(".solver-frame").setAttribute("data-failed", "");
    document.getElementById("solver-readout").textContent = "The map didn't load. Refresh the page to try again.";
  });

  function build(d) {
    var frame = host.querySelector(".solver-frame");
    var view = (host.getAttribute("data-view") || ("0 0 " + d.w + " " + d.h)).split(" ").map(Number);
    var svg = el("svg", { viewBox: view.join(" "), role: "img",
      "aria-label": "Map of the University of Arkansas campus showing parking lots, academic buildings, and lines from each building to its nearest chosen lot." });
    baseLayers(svg, d);

    var cand = [], lotEls = [];
    function inView(o) { return o.x >= view[0] && o.x <= view[0] + view[2] && o.y >= view[1] && o.y <= view[1] + view[3]; }
    d.lots.forEach(function (l) {
      var isCand = l.cand && inView(l);
      var p = el("path", { d: l.d, class: "lot" + (isCand ? " cand" : "") }, svg);
      if (isCand) {
        var spaces = l.s ? "about " + l.s.toLocaleString() + " spaces" : "spaces unknown";
        p.setAttribute("data-tip", l.n + ": " + l.t.toLowerCase() + ", " + spaces);
        cand.push(l); lotEls.push(p);
      }
    });
    var gLines = el("g", {}, svg);
    var gDem = el("g", {}, svg);
    d.dem = d.dem.filter(inView);
    d.dem.forEach(function (b) {
      var c = el("circle", { cx: b.x, cy: b.y, r: 15, class: "dem" }, gDem);
      c.setAttribute("data-tip", b.n);
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

    // distance matrix: buildings x candidate lots, straight line, metres
    var D = d.dem.map(function (b) { return cand.map(function (l) { return Math.hypot(l.x - b.x, l.y - b.y); }); });
    function cost(S) {
      var tot = 0;
      for (var i = 0; i < D.length; i++) { var m = Infinity; for (var j = 0; j < S.length; j++) { var v = D[i][S[j]]; if (v < m) m = v; } tot += m; }
      return tot / D.length;
    }
    // Greedy start, then Teitz-Bart interchange until no swap helps.
    var cache = {};
    function solve(k) {
      if (cache[k]) return cache[k];
      var S = [];
      for (var a = 0; a < k; a++) {
        var best = Infinity, bj = -1;
        for (var j = 0; j < cand.length; j++) { if (S.indexOf(j) >= 0) continue; var c = cost(S.concat([j])); if (c < best) { best = c; bj = j; } }
        S.push(bj);
      }
      var cur = cost(S), improved = true;
      while (improved) {
        improved = false;
        for (var i = 0; i < k; i++) for (var j2 = 0; j2 < cand.length; j2++) {
          if (S.indexOf(j2) >= 0) continue;
          var T = S.slice(); T[i] = j2; var c2 = cost(T);
          if (c2 < cur - 1e-9) { S = T; cur = c2; improved = true; }
        }
      }
      return (cache[k] = { S: S, avg: cur });
    }

    var readout = document.getElementById("solver-readout");
    var opened = document.getElementById("solver-opened");
    var anim = [];
    function draw(k, animate) {
      var sol = solve(k);
      anim.forEach(function (a) { a.cancel(); }); anim = [];
      while (gLines.firstChild) gLines.removeChild(gLines.firstChild);
      while (gHub.firstChild) gHub.removeChild(gHub.firstChild);
      lotEls.forEach(function (p, j) { p.classList.toggle("open", sol.S.indexOf(j) >= 0); });
      d.dem.forEach(function (b, i) {
        var bj = sol.S[0];
        sol.S.forEach(function (j) { if (D[i][j] < D[i][bj]) bj = j; });
        var l = cand[bj];
        var line = el("line", { x1: l.x, y1: l.y, x2: b.x, y2: b.y, class: "assign" }, gLines);
        if (animate && !reduce && line.animate) {
          var len = D[i][bj];
          line.setAttribute("stroke-dasharray", len + " " + len);
          anim.push(line.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }],
            { duration: 520, delay: Math.min(420, len * 0.35), easing: "cubic-bezier(.2,.7,.2,1)", fill: "both" }));
        }
      });
      sol.S.forEach(function (j) { el("circle", { cx: cand[j].x, cy: cand[j].y, r: 30, class: "hub" }, gHub); });
      var names = sol.S.map(function (j) { return cand[j].n; }).sort(function (a, b) { return a.localeCompare(b, "en", { numeric: true }); });
      readout.innerHTML = "Average walk <strong>" + (Math.round(sol.avg / 5) * 5) + " m</strong>";
      opened.textContent = "Opens " + names.join(", ");
    }

    var btns = host.querySelectorAll(".kpick button");
    function pick(btn, focus) {
      btns.forEach(function (b) { var on = b === btn; b.setAttribute("aria-checked", on); b.tabIndex = on ? 0 : -1; });
      if (focus) btn.focus();
      draw(+btn.getAttribute("data-k"), true);
    }
    btns.forEach(function (b, i) {
      b.addEventListener("click", function () { pick(b, false); });
      b.addEventListener("keydown", function (e) {
        var n = null;
        if (e.key === "ArrowRight" || e.key === "ArrowDown") n = btns[(i + 1) % btns.length];
        if (e.key === "ArrowLeft" || e.key === "ArrowUp") n = btns[(i - 1 + btns.length) % btns.length];
        if (n) { e.preventDefault(); pick(n, true); }
      });
    });
    var start = host.querySelector('.kpick button[aria-checked="true"]') || btns[2];
    draw(+start.getAttribute("data-k"), true);
  }
})();
