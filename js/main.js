/* RAAZ BORG — shared interface logic */

/* duplicate ticker content for seamless loop */
(function () {
  document.querySelectorAll(".ticker-track").forEach((track) => {
    track.innerHTML = "<span>" + track.innerHTML + "</span><span aria-hidden='true'>" + track.innerHTML + "</span>";
  });
})();

/* Spanish is the default. Shared language links take precedence over a saved choice. */
(function () {
  const toggle = document.getElementById("langToggle");
  const query = new URLSearchParams(location.search).get("lang");
  let saved;
  try { saved = localStorage.getItem("rb-lang"); } catch {}
  const initial = ["es", "en"].includes(query) ? query : saved === "en" ? "en" : "es";

  const translations = [];
  for (const [key, attr] of [["en", null], ["enLabel", "aria-label"], ["enContent", "content"], ["enAlt", "alt"], ["enGlitch", "data-text"]]) {
    const selector = "data-" + key.replace(/[A-Z]/g, c => "-" + c.toLowerCase());
    document.querySelectorAll("[" + selector + "]").forEach(element => {
      const spanish = attr ? element.getAttribute(attr) : element.textContent;
      translations.push(lang => {
        const value = lang === "es" ? spanish : element.dataset[key];
        if (attr) element.setAttribute(attr, value);
        else element.textContent = value;
      });
    });
  }

  function apply(lang) {
    document.body.dataset.lang = document.documentElement.lang = lang;
    translations.forEach(update => update(lang));
    if (toggle) {
      toggle.textContent = lang === "es" ? "EN" : "ES";
      toggle.setAttribute("aria-label", lang === "es" ? "Cambiar a inglés" : "Switch to Spanish");
    }
  }

  function remember(lang) {
    try { localStorage.setItem("rb-lang", lang); } catch {}
  }

  // Language selected by the user is distinct from a language restored from Supabase.
  // Authenticated pages save user changes through a separate protected RPC.
  function setLanguage(lang, source = "account") {
    if (!["es", "en"].includes(lang)) return;
    const changed = document.documentElement.lang !== lang;
    remember(lang);
    const url = new URL(location.href);
    if (url.searchParams.get("lang") !== lang) {
      url.searchParams.set("lang", lang);
      history.replaceState(null, "", url);
    }
    if (!changed && source !== "user") return;
    apply(lang);
    document.dispatchEvent(new CustomEvent("languagechange", {
      detail: { language: lang, source }
    }));
  }
  window.RaazLang = Object.freeze({
    get: () => document.documentElement.lang,
    set: setLanguage
  });

  apply(initial);
  if (query === initial) remember(initial);
  toggle?.addEventListener("click", () => {
    const lang = document.body.dataset.lang === "es" ? "en" : "es";
    setLanguage(lang, "user");
  });
})();

/* Mobile navigation */
(function () {
  const button = document.getElementById("burger");
  const links = document.querySelector(".nav-links");
  if (!button || !links) return;
  function setOpen(open) {
    links.classList.toggle("open", open);
    button.setAttribute("aria-expanded", String(open));
  }
  button.addEventListener("click", () => setOpen(!links.classList.contains("open")));
  links.addEventListener("click", () => setOpen(false));
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && links.classList.contains("open")) {
      setOpen(false);
      button.focus();
    }
  });
})();

/* scroll reveal */
(function () {
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }),
    { threshold: 0.12 }
  );
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
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


/* Keep bookmarked Clashes realm cards pointing to their home in the deck. */
(() => {
  const guide = document.getElementById("experience-guide-link");
  if (!guide) return;
  function followRealmBookmark() {
    if (!location.hash.startsWith("#realm-")) return;
    const destination = new URL(guide.href);
    destination.search = location.search;
    destination.hash = location.hash;
    location.replace(destination.href);
  }
  followRealmBookmark();
  window.addEventListener("hashchange", followRealmBookmark);
})();

/* ------- GRAND PRIX ARCHIVE ------ */
(() => {

  // Replace placeholder information with verified event details.
  const editions = [
  {
    year: "2020",
  name: "White Carbon Combat",
  color: "#e9edf0",
  image: "",
  champion: "",
  fighterId: "",
  en: "Eight Ecuadorian athletes competed in the first transmission. Add the confirmed results and defining moments here.",
  es: "Ocho atletas ecuatorianos participaron en la primera transmisión. Agrega aquí los resultados confirmados y los momentos destacados."
    },
  {
    year: "2021",
  name: "Blue Oblivion BJJ",
  color: "#00d8e2",
  image: "",
  champion: "",
  fighterId: "",
  en: "The system expanded into the Oblivion Protocol. Add the confirmed matches and tournament outcome here.",
  es: "El sistema se expandió al Protocolo Oblivion. Agrega aquí los combates confirmados y el resultado del torneo."
    },
  {
    year: "2021",
  name: "Violet Combat Royale",
  color: "#b579f7",
  image: "",
  champion: "",
  fighterId: "",
  en: "The Royale format brought a new challenge to the Grid. Add the verified highlights and winner here.",
  es: "El formato Royale trajo un nuevo desafío a la Red. Agrega aquí los momentos destacados confirmados y al ganador."
    },
  {
    year: "2022",
  name: "Oxide Overdrive",
  color: "#e87524",
  image: "assets/Oxide-Overdrive-Lineup.png",
  champion: "",
  fighterId: "",
  en: "The wasteland era began with Oxide Overdrive. Add the confirmed event recap and final result here.",
  es: "La era del páramo comenzó con Oxide Overdrive. Agrega aquí la reseña confirmada y el resultado final."
    },
  {
    year: "2024",
  name: "Praetoreans Interface GP",
  color: "#9c7a28",
  image: "",
  champion: "",
  fighterId: "",
  en: "Heroes faced heroes in the latest completed edition. Add the confirmed tournament recap here.",
  es: "Héroes se enfrentaron a héroes en la última edición celebrada. Agrega aquí la reseña confirmada del torneo."
    }
  ];

  const overlay = document.getElementById("gpArchiveOverlay");
  if (!overlay) return; // Archive UI only exists on the Clashes page.
  const panel = overlay.querySelector(".gp-archive-panel");
  const triggers = [...document.querySelectorAll(".timeline .t-item[data-gp]")];

  const $ = id => document.getElementById(id);

  let active = 0;
  let previousFocus = null;

  const language = () =>
  document.body.dataset.lang === "es" ? "es" : "en";

  function show(index) {
    active = (index + editions.length) % editions.length;

  const edition = editions[active];

  panel.style.setProperty("--gp-color", edition.color);

  $("gpArchiveYear").textContent = edition.year;
  $("gpArchiveTitle").textContent = edition.name;

  $("gpArchiveChampion").textContent =
  edition.champion ||
  (language() === "es" ? "POR CONFIRMAR" : "TO BE CONFIRMED");

  $("gpArchiveSummary").textContent = edition[language()];

  $("gpArchiveCount").textContent =
  `${String(active + 1).padStart(2, "0")} / ${String(editions.length).padStart(2, "0")}`;

  const link = $("gpArchiveFighterLink");

  link.hidden = !(edition.champion && edition.fighterId);

  if (!link.hidden) {
    link.href = `fighters.html#${encodeURIComponent(edition.fighterId)}`;
    }

  const img = $("gpArchiveImage");
  const fallback = $("gpArchiveImageFallback");

  img.hidden = true;
  fallback.hidden = false;
  img.removeAttribute("src");

  if (edition.image) {
    img.onload = () => {
      img.hidden = false;
      fallback.hidden = true;
    };

      img.onerror = () => {
    img.hidden = true;
  fallback.hidden = false;
      };

  img.alt = language() === "es" ? "Peleadores de " + edition.name : edition.name + " fighters";
  img.src = edition.image;
    }

  panel.scrollTop = 0;
  }

  function openArchive(index) {
    previousFocus = document.activeElement;
  show(index);

  overlay.hidden = false;
  document.body.classList.add("gp-archive-open");
  panel.focus();
  }

  function closeArchive() {
    overlay.hidden = true;
  document.body.classList.remove("gp-archive-open");

  if (previousFocus) previousFocus.focus();
  }

  triggers.forEach(trigger => {
    const index = Number(trigger.dataset.gp);

    trigger.addEventListener("click", () => openArchive(index));

    trigger.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
  openArchive(index);
      }
    });
  });

  function openLinkedEdition() {
    const trigger = triggers.find(item => "#" + item.id === location.hash);
    if (trigger) {
      openArchive(Number(trigger.dataset.gp));
      previousFocus = trigger;
    }
  }
  openLinkedEdition();
  window.addEventListener("hashchange", openLinkedEdition);

  $("gpArchiveClose").addEventListener("click", closeArchive);
  $("gpArchivePrev").addEventListener("click", () => show(active - 1));
  $("gpArchiveNext").addEventListener("click", () => show(active + 1));

  overlay.addEventListener("click", event => {
    if (event.target === overlay) closeArchive();
  });

  document.addEventListener("keydown", event => {
    if (overlay.hidden) return;

  if (event.key === "Escape") {
    closeArchive();
    }

  if (event.key === "ArrowLeft") {
    show(active - 1);
    }

  if (event.key === "ArrowRight") {
    show(active + 1);
    }

  if (event.key === "Tab") {
      const focusables = [...panel.querySelectorAll(
  'button, a[href]:not([hidden])'
      )].filter(el => !el.hidden);

  if (!focusables.length) return;

  const first = focusables[0];
  const last = focusables[focusables.length - 1];

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
  last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
  first.focus();
      }
    }
  });

  new MutationObserver(() => {
    if (!overlay.hidden) show(active);
  }).observe(document.body, {
    attributes: true,
  attributeFilter: ["data-lang"]
  });

})();


/* fake cart counter (shop) */
(function () {
  let count = 0;
  const badge = document.getElementById("cartCount");
  if (!badge) return;
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
/* On narrow screens the realm cards form a swipeable row. */
(() => {
  const deck = document.getElementById("realm-deck");
  if (!deck) return;
  const pager = document.querySelector(".deck-pager");
  const previous = pager.querySelector('[data-step="-1"]');
  const next = pager.querySelector('[data-step="1"]');
  const cards = Array.from(deck.children);

  deck.addEventListener("click", event => {
    const card = event.target.closest(".realm-preview[open]");
    if (!card || event.target.closest("summary, a")) return;
    card.open = false;
    card.querySelector("summary").focus({ preventScroll: true });
  });

  const finder = document.getElementById("belt-finder");
  const beltSelect = document.getElementById("realm-belt");
  const otherBelt = beltSelect.lastElementChild;
  const beltOptions = cards.map(card => {
    const option = new Option("", card.id);
    beltSelect.insertBefore(option, otherBelt);
    return { option, label: card.querySelector(".realm-strip [data-en]") };
  });
  function translateBelts() {
    beltOptions.forEach(({ option, label }) => { option.text = label.textContent; });
  }
  translateBelts();
  document.addEventListener("languagechange", translateBelts);
  finder.hidden = false;

  function openLinkedRealm() {
    const card = cards.find(item => "#" + item.id === location.hash);
    if (card) {
      card.open = true;
      beltSelect.value = card.id;
      card.scrollIntoView({ block: "start", inline: "center" });
    }
  }
  finder.addEventListener("submit", event => {
    event.preventDefault();
    if (beltSelect.value === "review") {
      location.assign("competir.html#athlete-interest");
      return;
    }
    const card = document.getElementById(beltSelect.value);
    if (!card) return;
    if (location.hash !== "#" + card.id) history.pushState(null, "", "#" + card.id);
    openLinkedRealm();
    card.querySelector("summary").focus({ preventScroll: true });
  });
  openLinkedRealm();
  window.addEventListener("hashchange", openLinkedRealm);

  function updatePager() {
    previous.disabled = deck.scrollLeft <= 1;
    next.disabled = deck.scrollLeft + deck.clientWidth >= deck.scrollWidth - 1;
  }

  function moveCard(direction) {
    const firstLeft = cards[0].offsetLeft;
    const current = cards.reduce((nearest, card, index) => {
      const distance = Math.abs(card.offsetLeft - firstLeft - deck.scrollLeft);
      const nearestDistance = Math.abs(cards[nearest].offsetLeft - firstLeft - deck.scrollLeft);
      return distance < nearestDistance ? index : nearest;
    }, 0);
    const index = Math.max(0, Math.min(cards.length - 1, current + direction));
    const left = cards[index].offsetLeft - firstLeft;
    deck.scrollTo({ left, behavior:matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }

  previous.addEventListener("click", () => moveCard(-1));
  next.addEventListener("click", () => moveCard(1));
  deck.addEventListener("scroll", updatePager, { passive:true });
  new ResizeObserver(updatePager).observe(deck);
  pager.hidden = false;
  updatePager();
})();
