document.querySelectorAll(".selectable-sizes").forEach(group => {
  const status = document.createElement("span");
  status.className = "size-selection-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  group.after(status);
  group.querySelectorAll("button:not(:disabled)").forEach(button => {
    button.addEventListener("click", () => {
      group.querySelectorAll("button").forEach(btn => {
        btn.classList.remove("selected");
        btn.setAttribute("aria-pressed", "false");
      });
      button.classList.add("selected");
      button.setAttribute("aria-pressed", "true");
      const selectionStatus = group.nextElementSibling?.classList.contains("size-selection-status")
        ? group.nextElementSibling : null;
      if (selectionStatus) {
        const size = button.dataset.size;
        selectionStatus.textContent = document.body.dataset.lang === "en"
          ? `Selected size: ${size}` : `Talla seleccionada: ${size}`;
      }
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

    const price = card.querySelector(".p-price")?.dataset.price;
    const subject = isSpanish ? `RAAZ BORG — Consulta sobre ${product}` : `RAAZ BORG Order Inquiry - ${product}`;

    const message = isSpanish
      ? `Hola RA’AZ BORG, quiero pedir ${product}, talla ${size === "One Size" ? "única" : size}, precio publicado $ ${price || "por confirmar"} USD. ¿Está disponible y cómo coordinamos la entrega?`
      : `Hello RA’AZ BORG, I'd like to order ${product}, size ${size}, listed at $ ${price || "TBC"} USD. Is it available, and how do we arrange delivery?`;

    if (method === "email") {
      const mailto = `mailto:raazborgstudios@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
      window.location.href = mailto;
    }

    if (method === "instagram") {
      // Open synchronously during the user's click. Waiting for clipboard access first can block popups.
      window.open("https://www.instagram.com/raazborg/", "_blank", "noopener,noreferrer");
      let notice = card.querySelector(".order-feedback");
      if (!notice) {
        notice = document.createElement("p");
        notice.className = "order-feedback";
        notice.setAttribute("role", "status");
        notice.setAttribute("aria-live", "polite");
        card.querySelector(".p-row").after(notice);
      }
      try {
        if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
        await navigator.clipboard.writeText(message);
        notice.textContent = isSpanish
          ? "Mensaje copiado. Abre Instagram, inicia un chat con @raazborg y pega el texto para enviarlo."
          : "Message copied. Open Instagram, start a chat with @raazborg and paste the text to send it.";
      } catch (error) {
        notice.textContent = isSpanish
          ? "Copia este mensaje y envíalo a @raazborg en Instagram:"
          : "Copy this message and send it to @raazborg on Instagram:";
        const draft = document.createElement("textarea");
        draft.className = "order-copy-field";
        draft.readOnly = true;
        draft.value = message;
        draft.setAttribute("aria-label", isSpanish ? "Mensaje para Instagram" : "Instagram order message");
        notice.append(draft);
        draft.focus();
        draft.select();
      }
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
