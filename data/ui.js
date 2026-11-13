/* GC GRAPHICS · accessible in-app dialogs (never native browser popups) */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  let resolver = null;
  let previousFocus = null;

  function close(value = false) {
    const overlay = $("uiDialogOverlay");
    if (!overlay || overlay.classList.contains("hidden")) return;
    overlay.classList.add("hidden");
    document.body.classList.remove("ui-dialog-open");
    const done = resolver;
    resolver = null;
    if (previousFocus?.focus) previousFocus.focus();
    previousFocus = null;
    done?.(value);
  }

  function setFields(fields = []) {
    const root = $("uiDialogFields");
    root.replaceChildren();
    for (const field of fields) {
      const label = document.createElement("label");
      label.className = "field ui-dialog-field";
      const text = document.createElement("span");
      text.textContent = field.label;
      const input = document.createElement(field.multiline ? "textarea" : "input");
      input.id = field.id;
      input.name = field.id;
      input.value = field.value || "";
      input.placeholder = field.placeholder || "";
      input.readOnly = !!field.readonly;
      if (!field.multiline) input.type = field.type || "text";
      if (field.autocomplete) input.autocomplete = field.autocomplete;
      if (field.minlength) input.minLength = field.minlength;
      if (field.maxlength) input.maxLength = field.maxlength;
      label.append(text, input);
      root.append(label);
    }
  }

  function open(options = {}) {
    if (resolver) close(false);
    const overlay = $("uiDialogOverlay");
    previousFocus = document.activeElement;
    $("uiDialogKicker").textContent = options.kicker || "GC GRAPHICS";
    $("uiDialogTitle").textContent = options.title || "Confirmación";
    $("uiDialogMessage").textContent = options.message || "";
    setFields(options.fields);
    const confirm = $("uiDialogConfirm");
    confirm.textContent = options.confirmLabel || "Aceptar";
    confirm.className = "btn " + (options.danger ? "btn-danger" : "btn-primary");
    $("uiDialogCancel").textContent = options.cancelLabel || "Cancelar";
    $("uiDialogCancel").classList.toggle("hidden", options.cancel === false);
    overlay.classList.remove("hidden");
    document.body.classList.add("ui-dialog-open");
    queueMicrotask(() => (options.fields?.length ? $(options.fields[0].id) : confirm)?.focus());
    return new Promise(resolve => { resolver = resolve; });
  }

  function ask(options) { return open({...options, cancel: true}); }
  function notice(options) { return open({...options, cancel: false, confirmLabel: options?.confirmLabel || "Entendido"}); }
  async function requestPassword(options = {}) {
    const result = await open({
      kicker: "SEGURIDAD FAMILIAR",
      title: options.title || "Elegir contraseña",
      message: options.message || "Usa al menos 12 caracteres. Evita nombres, fechas y contraseñas reutilizadas.",
      confirmLabel: options.confirmLabel || "Guardar nueva contraseña",
      fields: [
        {id:"uiPassword",label:"Contraseña",type:"password",autocomplete:"new-password",minlength:12,maxlength:128,placeholder:"12 caracteres o más"},
        {id:"uiPasswordConfirm",label:"Confirmar contraseña",type:"password",autocomplete:"new-password",minlength:12,maxlength:128,placeholder:"Repite la contraseña"}
      ]
    });
    if (!result) return null;
    return result;
  }

  function passwordStrength(value) {
    const password = String(value || "");
    let score = 0;
    if (password.length >= 12) score++;
    if (password.length >= 16) score++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    return {score, label: score <= 1 ? "Débil" : score <= 3 ? "Aceptable" : "Fuerte"};
  }

  function init() {
    $("uiDialogCancel")?.addEventListener("click", () => close(false));
    $("uiDialogClose")?.addEventListener("click", () => close(false));
    $("uiDialogConfirm")?.addEventListener("click", () => {
      const fields = [...$("uiDialogFields").querySelectorAll("input,textarea")];
      if (fields.length) {
        const values = Object.fromEntries(fields.map(field => [field.name, field.value]));
        if (values.uiPassword !== undefined) {
          const error = $("uiDialogError");
          if (values.uiPassword.length < 12) { error.textContent = "La contraseña debe tener al menos 12 caracteres."; return; }
          if (values.uiPassword.length > 128) { error.textContent = "La contraseña es demasiado larga."; return; }
          if (values.uiPassword !== values.uiPasswordConfirm) { error.textContent = "Las contraseñas no coinciden."; return; }
        }
        $("uiDialogError").textContent = "";
        close(values);
      } else close(true);
    });
    $("uiDialogOverlay")?.addEventListener("click", event => { if (event.target === event.currentTarget) close(false); });
    $("uiDialogOverlay")?.addEventListener("keydown", event => {
      if (event.key === "Escape") { event.preventDefault(); close(false); return; }
      if (event.key !== "Tab") return;
      const focusable = [...event.currentTarget.querySelectorAll("button:not([disabled]),input:not([disabled]),textarea:not([disabled])")].filter(el => !el.closest(".hidden"));
      if (!focusable.length) return;
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
  }

  window.GCDialog = {confirm:ask, notice, requestPassword, passwordStrength};
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
