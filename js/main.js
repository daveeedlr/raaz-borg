/* RAAZ BORG — shared interface logic */

/* language toggle with persistence */
(function () {
  const saved = localStorage.getItem("rb-lang") || "en";
  document.body.dataset.lang = saved;
  document.documentElement.lang = saved;
  const t = document.getElementById("langToggle");
  if (t) {
    t.textContent = saved === "en" ? "ES" : "EN";
    t.addEventListener("click", () => {
      const next = document.body.dataset.lang === "en" ? "es" : "en";
      document.body.dataset.lang = next;
      document.documentElement.lang = next;
      localStorage.setItem("rb-lang", next);
      t.textContent = next === "en" ? "ES" : "EN";
    });
  }
})();

/* mobile nav */
(function () {
  const b = document.getElementById("burger");
  const links = document.querySelector(".nav-links");
  if (b && links) b.addEventListener("click", () => links.classList.toggle("open"));
})();

/* scroll reveal */
(function () {
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }),
    { threshold: 0.12 }
  );
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
})();

/* duplicate ticker content for seamless loop */
(function () {
  document.querySelectorAll(".ticker-track").forEach((track) => {
    track.innerHTML = "<span>" + track.innerHTML + "</span><span aria-hidden='true'>" + track.innerHTML + "</span>";
  });
})();

/* typed system line */
(function () {
  const el = document.querySelector(".sysline .type-target");
  if (!el) return;
  const lines = JSON.parse(el.dataset.lines || "[]");
  let li = 0, ci = 0, dir = 1;
  function tick() {
    const line = lines[li % lines.length];
    ci += dir;
    el.textContent = line.slice(0, ci);
    if (dir === 1 && ci >= line.length) { dir = -1; setTimeout(tick, 2200); return; }
    if (dir === -1 && ci <= 0) { dir = 1; li++; setTimeout(tick, 400); return; }
    setTimeout(tick, dir === 1 ? 45 : 18);
  }
  tick();
})();

/* fake cart counter (shop) */
(function () {
  let count = 0;
  const badge = document.getElementById("cartCount");
  document.querySelectorAll(".p-cart").forEach((btn) => {
    btn.addEventListener("click", () => {
      count++;
      if (badge) badge.textContent = count;
      const en = btn.querySelector(".lang-en"), es = btn.querySelector(".lang-es");
      if (en) en.textContent = "ADDED ✓";
      if (es) es.textContent = "AÑADIDO ✓";
      btn.style.borderColor = "var(--acid)";
      btn.style.color = "var(--acid)";
      setTimeout(() => {
        if (en) en.textContent = "ADD +";
        if (es) es.textContent = "AGREGAR +";
        btn.style.borderColor = ""; btn.style.color = "";
      }, 1400);
    });
  });
})();
