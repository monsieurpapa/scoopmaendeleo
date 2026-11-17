/* News dropdown + sub-page nav behaviour */
(function () {
  document.querySelectorAll(".dd").forEach(function (dd) {
    var btn = dd.querySelector(".dd-btn");
    if (!btn) return;
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var open = !dd.classList.contains("open");
      dd.classList.toggle("open", open);
      btn.setAttribute("aria-expanded", open);
    });
    dd.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { dd.classList.remove("open"); btn.setAttribute("aria-expanded", "false"); btn.focus(); }
    });
    dd.addEventListener("mouseleave", function () { dd.classList.remove("open"); btn.setAttribute("aria-expanded", "false"); });
  });
  document.addEventListener("click", function (e) {
    document.querySelectorAll(".dd.open").forEach(function (dd) {
      if (!dd.contains(e.target)) { dd.classList.remove("open"); dd.querySelector(".dd-btn").setAttribute("aria-expanded", "false"); }
    });
  });

  if (!document.body.classList.contains("sub")) return;

  /* mobile drawer on sub-pages */
  var dr = document.getElementById("drawer");
  var bg = document.getElementById("burger");
  var cl = document.getElementById("dclose");
  if (dr && bg) bg.addEventListener("click", function () { dr.classList.add("open"); });
  if (dr && cl) cl.addEventListener("click", function () { dr.classList.remove("open"); });
  if (dr) dr.querySelectorAll("a").forEach(function (a) { a.addEventListener("click", function () { dr.classList.remove("open"); }); });

  /* category filters on the listing page */
  var grid = document.getElementById("newsGrid");
  document.querySelectorAll(".nfilters button").forEach(function (b) {
    b.addEventListener("click", function () {
      document.querySelectorAll(".nfilters button").forEach(function (x) { x.setAttribute("aria-pressed", x === b); });
      var c = b.dataset.cat;
      grid.querySelectorAll(".ncard").forEach(function (card) { card.hidden = c !== "all" && card.dataset.cat !== c; });
    });
  });

  /* copy-link button on articles */
  var cp = document.getElementById("copyLink");
  if (cp) cp.addEventListener("click", function () {
    var done = function () { cp.textContent = cp.dataset.done; };
    if (navigator.clipboard) navigator.clipboard.writeText(location.href).then(done, function () {});
  });

  var y = document.getElementById("yr");
  if (y) y.textContent = new Date().getFullYear();
})();
