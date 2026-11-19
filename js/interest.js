/* The athlete reviews and sends the inquiry through their own email account. */
(() => {
  const form = document.getElementById("athlete-interest");
  const preview = document.getElementById("email-preview");
  const draft = document.getElementById("email-body");
  const send = document.getElementById("send-inquiry");
  const recipient = "raazborgstudios@gmail.com";
  const belt = form.elements.belt;
  const realmName = document.getElementById("belt-realm");
  const assigned = document.getElementById("belt-assigned");
  const review = document.getElementById("belt-review");
  const requestedBelt = new URLSearchParams(location.search).get("belt");
  if (requestedBelt && Array.from(belt.options).some(option => option.value === requestedBelt)) {
    belt.value = requestedBelt;
  }

  function updateRealm() {
    const realm = belt.selectedOptions[0].dataset.realm || "";
    realmName.textContent = realm;
    assigned.hidden = !realm;
    review.hidden = !belt.value || Boolean(realm);
  }

  updateRealm();
  form.hidden = false;

  function writeDraft() {
    const es = document.documentElement.lang === "es";
    const data = new FormData(form);
    const fields = [
      [es ? "Nombre o alias" : "Name or alias", data.get("alias")],
      [es ? "Correo" : "Email", data.get("email")],
      [es ? "Ciudad" : "City", data.get("city")],
      [es ? "Academia o equipo" : "Academy or team", data.get("academy")],
      [es ? "Cinturón" : "Belt", belt.selectedOptions[0].textContent],
      [es ? "Reino sugerido" : "Suggested realm", realmName.textContent || (es ? "Por definir con el equipo" : "To be reviewed by the team")],
      [es ? "Disciplina" : "Discipline", data.get("discipline")],
      [es ? "Interés" : "Interest", form.elements.interest.selectedOptions[0].textContent],
      [es ? "Enlace" : "Link", data.get("footage")]
    ];
    const subject = es ? "RA’AZ BORG — Solicitud de atleta" : "RA’AZ BORG — Athlete inquiry";
    const lines = fields.filter(([, value]) => value.trim()).map(([label, value]) => label + ": " + value.trim());
    lines.push("", es ? "Acepto que me contacten sobre esta solicitud." : "I agree to be contacted about this inquiry.");
    draft.value = lines.join("\n");
    send.href = "mailto:" + recipient + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(draft.value);
  }
  function clearDraft() {
    preview.hidden = true;
    draft.value = "";
    send.removeAttribute("href");
  }
  belt.addEventListener("change", () => {
    updateRealm();
    clearDraft();
    const url = new URL(location.href);
    if (belt.value) url.searchParams.set("belt", belt.value);
    else url.searchParams.delete("belt");
    history.replaceState(null, "", url);
  });
  window.addEventListener("pageshow", updateRealm);
  form.addEventListener("input", clearDraft);
  form.addEventListener("submit", event => {
    event.preventDefault();
    writeDraft();
    preview.hidden = false;
    send.focus();
  });
  document.addEventListener("languagechange", () => {
    if (!preview.hidden) writeDraft();
  });
})();
