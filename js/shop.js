document.querySelectorAll(".selectable-sizes").forEach(group => {
  group.querySelectorAll("button:not(:disabled)").forEach(button => {
    button.addEventListener("click", () => {
      group.querySelectorAll("button").forEach(btn => {
        btn.classList.remove("selected");
        btn.setAttribute("aria-pressed", "false");
      });
      button.classList.add("selected");
      button.setAttribute("aria-pressed", "true");
    });
  });
});


document.querySelectorAll(".order-product").forEach(button => {
  button.addEventListener("click", async () => {
    const card = button.closest(".p-card");
    const product = card.querySelector("h3").textContent.trim();
    const size = card.querySelector(".selectable-sizes .selected")
      ?.dataset.size || "One Size";

    const method = button.dataset.method;
    const isSpanish = document.body.dataset.lang === "es";

    const subject = isSpanish ? `RAAZ BORG — Consulta sobre ${product}` : `RAAZ BORG Order Inquiry - ${product}`;

    const message = isSpanish
      ? `Hola RAAZ BORG, estoy interesado/a en comprar ${product}, talla ${size === "One Size" ? "única" : size}. ¿Está disponible?`
      : `Hello RAAZ BORG, I'm interested in ordering ${product}, size ${size}. Is it available?`;

    if (method === "email") {
      const mailto = `mailto:raazborgstudios@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
      window.location.href = mailto;
    }

    if (method === "instagram") {
      try {
        await navigator.clipboard.writeText(message);
      } catch (error) {
        window.prompt(isSpanish ? "Copia tu mensaje" : "Copy your message", message);
      }

      window.open(
        "https://www.instagram.com/raazborg/",
        "_blank",
        "noopener,noreferrer"
      );
    }
  });
});


/* Load the original photograph only when someone opens the gallery. */
(() => {
  const dialog = document.getElementById("productLightbox");
  const preview = document.getElementById("lightboxImage");
  const counter = document.getElementById("lightboxCounter");
  let thumbnails = [];
  let index = 0;
  let trigger;

  function showImage(position) {
    index = (position + thumbnails.length) % thumbnails.length;
    const thumbnail = thumbnails[index];
    preview.src = thumbnail.dataset.full;
    preview.alt = thumbnail.alt;
    counter.textContent = (index + 1) + " / " + thumbnails.length;
  }

  for (const card of document.querySelectorAll(".p-card")) {
    const cover = card.querySelector(".product-gallery");
    const photo = cover.querySelector("img");
    const views = Array.from(card.querySelectorAll(".thumb img"));
    let selected = 0;

    function openGallery(button) {
      trigger = button;
      thumbnails = views;
      showImage(selected);
      dialog.showModal();
    }

    cover.addEventListener("click", () => openGallery(cover));
    views.forEach((view, position) => {
      const button = view.closest("button");
      button.addEventListener("click", () => {
        selected = position;
        photo.src = view.dataset.full;
        views.forEach((item, i) => item.closest("button").classList.toggle("active", i === selected));
        openGallery(button);
      });
    });
  }

  dialog.querySelector(".lightbox-prev").addEventListener("click", () => showImage(index - 1));
  dialog.querySelector(".lightbox-next").addEventListener("click", () => showImage(index + 1));
  dialog.querySelector(".lightbox-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("keydown", event => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      showImage(index + (event.key === "ArrowRight" ? 1 : -1));
    }
  });
  dialog.addEventListener("click", event => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", () => {
    preview.removeAttribute("src");
    trigger?.focus({ preventScroll:true });
  });
})();
