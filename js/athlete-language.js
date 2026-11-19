/* RA’AZ BORG — persistent account email language preference. */
(() => {
  "use strict";

  function connect(client, currentUser, onChanged = () => {}) {
    let interactionVersion = 0;
    let restoreVersion = 0;

    function display(lang, saved = true) {
      if (!["es", "en"].includes(lang)) return;
      onChanged(lang, saved);
    }

    async function save(lang) {
      const id = currentUser()?.id;
      if (!id || !["es", "en"].includes(lang)) return false;
      try {
        const { data, error } = await client.rpc("rb_set_language", { p_language: lang });
        if (error || data !== lang || currentUser()?.id !== id) {
          display(lang, false);
          return false;
        }
        display(lang, true);
        return true;
      } catch {
        if (currentUser()?.id === id) display(lang, false);
        return false;
      }
    }

    async function restore() {
      const id = currentUser()?.id;
      if (!id) return;
      const revision = ++restoreVersion;
      const interactions = interactionVersion;
      try {
        const { data, error } = await client.rpc("rb_my_language");
        if (!error && ["es", "en"].includes(data) &&
            currentUser()?.id === id && revision === restoreVersion &&
            interactions === interactionVersion) {
          // Do not write the restored value back or override a newer user choice.
          window.RaazLang?.set(data, "account");
          display(data, true);
        }
      } catch {
        // The page remains usable if the preference service is temporarily offline.
      }
    }

    function onLanguageChange(event) {
      const lang = document.documentElement.lang;
      if (event.detail?.source !== "user") return;
      interactionVersion++;
      display(lang, false);
      if (currentUser()) void save(lang);
    }

    document.addEventListener("languagechange", onLanguageChange);
    return Object.freeze({
      restore,
      save,
      dispose: () => document.removeEventListener("languagechange", onLanguageChange)
    });
  }

  window.RaazAthleteLanguage = Object.freeze({ connect });
})();
