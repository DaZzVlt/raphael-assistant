"use strict";

(() => {
  const bridge = "http://127.0.0.1:8765";
  const statusBox = document.querySelector("#connection-status");
  const connectionMessage = document.querySelector("#connection-message");
  const nameLabel = document.querySelector("#raphael-name");
  const actionStatus = document.querySelector("#action-status");

  function showConnection(online, message, name = "") {
    statusBox.classList.toggle("is-online", online);
    statusBox.classList.toggle("is-offline", !online);
    statusBox.classList.remove("is-checking");
    connectionMessage.textContent = message;
    nameLabel.hidden = !online || !name;
    nameLabel.textContent = name ? `Conectado como ${name}` : "";
  }

  async function checkRaphael() {
    try {
      const response = await fetch(`${bridge}/status`, {
        cache: "no-store",
        mode: "cors",
        signal: AbortSignal.timeout(2200),
      });
      if (!response.ok) throw new Error("Raphael aún no está disponible.");
      const status = await response.json();
      showConnection(
        true,
        "🟢 Raphael detectado en tu PC — Vinculación en 1 clic activa",
        status.name || "",
      );
      return true;
    } catch {
      showConnection(
        false,
        "⚪ Abre Raphael en tu PC para enviar los datos automáticamente",
      );
      return false;
    }
  }

  function report(message, kind = "") {
    actionStatus.textContent = message;
    actionStatus.classList.toggle("is-success", kind === "success");
    actionStatus.classList.toggle("is-error", kind === "error");
    actionStatus.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  async function postToRaphael(endpoint, payload) {
    const response = await fetch(`${bridge}${endpoint}`, {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(12000),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Raphael no pudo completar la solicitud.");
    return result;
  }

  // NUEVO: Captura automática cuando Spotify o Google redirigen de vuelta a esta GitHub Page con ?code=...
  async function handleIncomingOAuthCallback() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const error = params.get("error");
    const state = params.get("state") || "spotify";
    const fullCallbackUrl = window.location.href;

    if (!code && !error) return;

    // Limpiar el ?code=... de la barra de direcciones para que la URL quede limpia y estética
    window.history.replaceState({}, document.title, window.location.pathname);

    if (error) {
      report(`❌ Autorización cancelada o denegada (${error}).`, "error");
      return;
    }

    report("🔄 Autorización recibida. Sincronizando token directamente con Raphael en tu PC…");

    try {
      // 1. Enviar por el puente principal de Raphael (127.0.0.1:8765/oauth_callback)
      const result = await postToRaphael("/oauth_callback", {
        service: state.includes("google") ? "google" : "spotify",
        code,
        state,
        redirect_url: fullCallbackUrl,
      });

      report(
        result.message || "✅ ¡Cuenta vinculada con éxito en Raphael! Ya puedes volver a la aplicación.",
        "success",
      );
      await checkRaphael();
    } catch (bridgeErr) {
      // 2. Fallback automático: si Spotipy abrió su propio listener en 127.0.0.1:8888/callback
      try {
        await fetch(`http://127.0.0.1:8888/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`, {
          mode: "no-cors",
          signal: AbortSignal.timeout(4000),
        });
        report("✅ ¡Código entregado a Raphael (puerto 8888)! Ya puedes cerrar esta pestaña.", "success");
      } catch {
        report(
          `⚠️ Recibimos tu código de autorización, pero Raphael no respondió en tu PC (${bridgeErr.message}). Abre Raphael e inténtalo de nuevo.`,
          "error",
        );
      }
    }
  }

  function collectCredentials() {
    return {
      gemini_api_key: document.querySelector("#gemini-key").value.trim(),
      spotify_client_id: document.querySelector("#spotify-client-id").value.trim(),
      spotify_client_secret: document.querySelector("#spotify-client-secret").value.trim(),
      discord_bot_token: document.querySelector("#discord-token").value.trim(),
      discord_user_id: document.querySelector("#discord-user-id").value.trim(),
      azure_speech_key: document.querySelector("#azure-key").value.trim(),
      azure_speech_region: document.querySelector("#azure-region").value.trim(),
    };
  }

  function envEscape(value) {
    if (/^[A-Za-z0-9_./:@+=,-]*$/.test(value)) return value;
    if (/[\r\n\x00\\]/.test(value)) {
      throw new Error("Un valor contiene caracteres que no se pueden representar de forma segura en .env.");
    }
    if (!value.includes('"')) return `"${value}"`;
    if (!value.includes("'")) return `'${value}'`;
    throw new Error("Un valor contiene comillas simples y dobles, no se puede exportar a .env.");
  }

  function buildEnvFile(credentials) {
    const entries = [
      ["GEMINI_API_KEY", credentials.gemini_api_key],
      ["SPOTIPY_CLIENT_ID", credentials.spotify_client_id],
      ["SPOTIPY_CLIENT_SECRET", credentials.spotify_client_secret],
      ["DISCORD_BOT_TOKEN", credentials.discord_bot_token],
      ["DISCORD_USER_ID", credentials.discord_user_id],
      ["AZURE_SPEECH_KEY", credentials.azure_speech_key],
      ["AZURE_SPEECH_REGION", credentials.azure_speech_region],
    ].filter(([, value]) => value);
    if (!entries.length) throw new Error("Escribe al menos una credencial antes de crear el archivo.");
    return [
      "# Configuración de Raphael Core",
      "# Copia este archivo a %LOCALAPPDATA%\\Raphael_Core\\.env",
      ...entries.map(([key, value]) => `${key}=${envEscape(value)}`),
      "",
    ].join("\n");
  }

  document.querySelector("#send-gemini").addEventListener("click", async () => {
    const key = document.querySelector("#gemini-key").value.trim();
    if (!key) {
      report("Pega primero tu Gemini API Key.", "error");
      document.querySelector("#gemini-key").focus();
      return;
    }
    report("Enviando la clave directamente a Raphael…");
    try {
      const result = await postToRaphael("/apply_config", { gemini_api_key: key });
      document.querySelector("#gemini-key").value = "";
      report(result.message || "Clave guardada en Raphael.", "success");
      await checkRaphael();
    } catch (error) {
      report(`${error.message} Puedes descargar un .env como alternativa.`, "error");
      await checkRaphael();
    }
  });

  document.querySelector("#send-advanced").addEventListener("click", async () => {
    const credentials = collectCredentials();
    const fields = Object.values(credentials);
    if (!fields.some(Boolean)) {
      report("No hay opciones avanzadas para guardar.", "error");
      return;
    }
    report("Guardando opciones avanzadas en Raphael…");
    try {
      const result = await postToRaphael("/apply_config", credentials);
      for (const id of ["discord-token", "azure-key"]) {
        document.querySelector(`#${id}`).value = "";
      }
      report(result.message || "Opciones guardadas en Raphael.", "success");
      await checkRaphael();
    } catch (error) {
      report(`${error.message} Puedes descargar un .env como alternativa.`, "error");
      await checkRaphael();
    }
  });

  document.querySelectorAll("[data-oauth]").forEach((button) => {
    button.addEventListener("click", async () => {
      const service = button.dataset.oauth;
      const messages = {
        google: "Solicitando a Raphael que abra el inicio de sesión de Google…",
        spotify: "Solicitando a Raphael que abra Spotify en tu navegador…",
        whatsapp: "Solicitando a Raphael que muestre el código QR…",
      };
      report(messages[service] || "Conectando…");
      try {
        if (service === "spotify") {
          const clientId = document.querySelector("#spotify-client-id").value.trim();
          const clientSecret = document.querySelector("#spotify-client-secret").value.trim();
          if (clientId) {
            const config = { spotify_client_id: clientId };
            if (clientSecret) config.spotify_client_secret = clientSecret;
            await postToRaphael("/apply_config", config);
          }
        }
        const result = await postToRaphael("/trigger_oauth", { service });
        // Si el backend de Raphael devuelve una auth_url directa, redirigir el navegador de inmediato
        if (result.auth_url) {
          window.location.href = result.auth_url;
          return;
        }
        report(
          service === "whatsapp"
            ? "Raphael abrió el panel de WhatsApp. Escanea el QR con tu teléfono."
            : result.message || "Raphael inició la autorización en tu PC.",
          "success",
        );
        await checkRaphael();
      } catch (error) {
        report(`${error.message} Abre Raphael en este PC y vuelve a intentarlo.`, "error");
        await checkRaphael();
      }
    });
  });

  document.querySelector("#download-env").addEventListener("click", () => {
    try {
      const contents = buildEnvFile(collectCredentials());
      const blob = new Blob([contents], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = ".env";
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      report("Archivo .env descargado. Contiene solo los datos que escribiste en este navegador.", "success");
    } catch (error) {
      report(error.message, "error");
    }
  });

  checkRaphael().then(() => {
    handleIncomingOAuthCallback();
  });
  window.setInterval(checkRaphael, 5000);
})();
