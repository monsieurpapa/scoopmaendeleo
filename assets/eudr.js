/* EUDR section: full-screen map viewer (zoom / pan / pinch) + "request EUDR file" shortcut */
(function () {
  var viewer = document.getElementById("mapViewer");
  if (!viewer) return;
  var stage = viewer.querySelector(".mv-stage");
  var img = viewer.querySelector(".mv-img");
  var scale = 1, x = 0, y = 0, MIN = 1, MAX = 5;
  var pointers = new Map(), startDist = 0, startScale = 1, last = null, lastFocus = null;

  function clamp() {
    var r = stage.getBoundingClientRect();
    var w = img.offsetWidth * scale, h = img.offsetHeight * scale;
    var mx = Math.max(0, (w - r.width) / 2), my = Math.max(0, (h - r.height) / 2);
    x = Math.min(mx, Math.max(-mx, x));
    y = Math.min(my, Math.max(-my, y));
  }
  function apply(anim) {
    clamp();
    img.style.transition = anim ? "transform .25s ease" : "none";
    img.style.transform = "translate(" + x + "px," + y + "px) scale(" + scale + ")";
    viewer.querySelector(".mv-zoom").textContent = Math.round(scale * 100) + "%";
    viewer.classList.toggle("zoomed", scale > 1.01);
  }
  function zoomAt(newScale, cx, cy, anim) {
    newScale = Math.min(MAX, Math.max(MIN, newScale));
    var r = stage.getBoundingClientRect();
    var px = cx - (r.left + r.width / 2), py = cy - (r.top + r.height / 2);
    x = px - (px - x) * (newScale / scale);
    y = py - (py - y) * (newScale / scale);
    scale = newScale;
    apply(anim);
  }
  function center() { var r = stage.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }

  function open() {
    lastFocus = document.activeElement;
    viewer.hidden = false;
    document.body.style.overflow = "hidden";
    if (!img.getAttribute("src")) img.setAttribute("src", img.dataset.src);
    scale = 1; x = 0; y = 0; apply(false);
    viewer.querySelector(".mv-close").focus();
  }
  function close() {
    viewer.hidden = true;
    document.body.style.overflow = "";
    if (lastFocus) lastFocus.focus();
  }
  document.querySelectorAll("[data-open-map]").forEach(function (b) { b.addEventListener("click", open); });
  viewer.querySelector(".mv-close").addEventListener("click", close);
  viewer.querySelector(".mv-in").addEventListener("click", function () { var c = center(); zoomAt(scale * 1.6, c[0], c[1], true); });
  viewer.querySelector(".mv-out").addEventListener("click", function () { var c = center(); zoomAt(scale / 1.6, c[0], c[1], true); });
  viewer.querySelector(".mv-reset").addEventListener("click", function () { scale = 1; x = 0; y = 0; apply(true); });
  document.addEventListener("keydown", function (e) {
    if (viewer.hidden) return;
    if (e.key === "Escape") close();
    var c = center();
    if (e.key === "+" || e.key === "=") zoomAt(scale * 1.4, c[0], c[1], true);
    if (e.key === "-") zoomAt(scale / 1.4, c[0], c[1], true);
    var step = 60;
    if (e.key === "ArrowLeft") { x += step; apply(true); }
    if (e.key === "ArrowRight") { x -= step; apply(true); }
    if (e.key === "ArrowUp") { y += step; apply(true); }
    if (e.key === "ArrowDown") { y -= step; apply(true); }
  });
  stage.addEventListener("wheel", function (e) { e.preventDefault(); zoomAt(scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY, false); }, { passive: false });
  stage.addEventListener("dblclick", function (e) { zoomAt(scale > 1.5 ? 1 : 2.5, e.clientX, e.clientY, true); });
  stage.addEventListener("pointerdown", function (e) {
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (pointers.size === 2) {
      var p = Array.from(pointers.values());
      startDist = Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]); startScale = scale;
    }
    last = [e.clientX, e.clientY];
  });
  stage.addEventListener("pointermove", function (e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (pointers.size === 2) {
      var p = Array.from(pointers.values());
      var d = Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]);
      zoomAt(startScale * d / startDist, (p[0][0] + p[1][0]) / 2, (p[0][1] + p[1][1]) / 2, false);
    } else if (last && scale > 1) {
      x += e.clientX - last[0]; y += e.clientY - last[1]; last = [e.clientX, e.clientY]; apply(false);
    }
  });
  function up(e) { pointers.delete(e.pointerId); last = pointers.size ? Array.from(pointers.values())[0] : null; }
  stage.addEventListener("pointerup", up);
  stage.addEventListener("pointercancel", up);
  window.addEventListener("resize", function () { if (!viewer.hidden) apply(false); });

  /* "Request the EUDR file": pre-fill the contact form */
  document.querySelectorAll("[data-eudr-request]").forEach(function (b) {
    b.addEventListener("click", function (e) {
      var radio = document.querySelector('input[name=intent][value=eudr]');
      var msg = document.getElementById("fm");
      if (!radio || !msg) return;
      e.preventDefault();
      radio.checked = true;
      var fr = document.documentElement.lang !== "en";
      var line = fr ? "Je souhaite recevoir le dossier EUDR (carte de risque et données de géolocalisation des parcelles)."
                    : "I would like to receive the EUDR file (risk map and plot geolocation data).";
      if (msg.value.indexOf(line) === -1) msg.value = line + (msg.value ? "\n" + msg.value : "");
      document.getElementById("contact").scrollIntoView({ behavior: "smooth" });
      setTimeout(function () { var n = document.getElementById("fn"); if (n) n.focus({ preventScroll: true }); }, 700);
    });
  });
})();
