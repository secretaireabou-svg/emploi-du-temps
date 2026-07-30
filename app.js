(() => {
  const STORAGE_KEY = "emploi-du-temps.events";
  const TOKEN_KEY = "emploi-du-temps.gtoken";
  const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
  const APP_TAG = "emploi-du-temps";

  const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
  const START_HOUR = 7;
  const END_HOUR = 22;
  const COLORS = ["#4f6df5", "#e5484d", "#16a34a", "#f59e0b", "#a855f7", "#0891b2", "#ec4899"];

  const grid = document.getElementById("schedule-grid");
  const modalOverlay = document.getElementById("modal-overlay");
  const form = document.getElementById("event-form");
  const modalTitle = document.getElementById("modal-title");
  const formError = document.getElementById("form-error");
  const colorPicker = document.getElementById("color-picker");
  const daySelect = document.getElementById("event-day");
  const btnDelete = document.getElementById("btn-delete");
  const btnGoogle = document.getElementById("btn-google");
  const syncStatus = document.getElementById("sync-status");
  const periodDate = document.getElementById("period-date");
  const periodTitle = document.getElementById("period-title");
  const periodModes = [...document.querySelectorAll(".period-mode")];

  let events = loadEvents();
  let googleEvents = [];
  let selectedColor = COLORS[0];
  let tokenClient = null;
  let accessToken = null;
  let tokenExpiresAt = 0;
  let activeView = localStorage.getItem("emploi-du-temps.view") || "week";
  let activeDate = new Date();

  function loadEvents() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveEvents() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function timeToMinutes(t) {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  }

  function dateKey(date) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function getMonday(date = activeDate) {
    const day = date.getDay(); // 0 = Sunday
    const diff = (day === 0 ? -6 : 1) - day;
    const monday = new Date(date);
    monday.setDate(date.getDate() + diff);
    monday.setHours(0, 0, 0, 0);
    return monday;
  }

  function getMondayOfCurrentWeek() {
    return getMonday(activeDate);
  }

  function formatPeriodTitle() {
    const longDate = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" });
    if (activeView === "day") return longDate.format(activeDate);
    if (activeView === "week") {
      const start = getMonday(activeDate);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return `${longDate.format(start)} — ${longDate.format(end)}`;
    }
    if (activeView === "month") {
      return new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(activeDate);
    }
    return String(activeDate.getFullYear());
  }

  function updatePeriodControls() {
    periodDate.value = dateKey(activeDate);
    periodTitle.textContent = formatPeriodTitle();
    periodModes.forEach((button) =>
      button.classList.toggle("active", button.dataset.view === activeView)
    );
  }

  function buildGrid() {
    updatePeriodControls();
    if (activeView === "month" || activeView === "year") {
      buildAgendaList();
      return;
    }

    grid.innerHTML = "";
    const monday = getMondayOfCurrentWeek();
    const todayStr = new Date().toDateString();
    const visibleDays = activeView === "day"
      ? [((activeDate.getDay() + 6) % 7)]
      : DAYS.map((_, index) => index);

    grid.className = `schedule-grid view-${activeView}`;
    grid.style.gridTemplateColumns = `64px repeat(${visibleDays.length}, minmax(130px, 1fr))`;
    grid.style.minWidth = activeView === "day" ? "360px" : "960px";

    // Top-left empty header cell
    const corner = document.createElement("div");
    corner.className = "grid-header time-col-header";
    grid.appendChild(corner);

    // Day headers
    visibleDays.forEach((i) => {
      const day = DAYS[i];
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const header = document.createElement("div");
      header.className = "grid-header";
      header.innerHTML = `${day}<div class="day-date">${d.getDate()}/${d.getMonth() + 1}</div>`;
      grid.appendChild(header);
    });

    // Time labels column
    const timeColWrapper = document.createElement("div");
    for (let h = START_HOUR; h < END_HOUR; h++) {
      const label = document.createElement("div");
      label.className = "time-label";
      label.textContent = `${String(h).padStart(2, "0")}:00`;
      timeColWrapper.appendChild(label);
    }
    timeColWrapper.style.gridColumn = "1";
    grid.appendChild(timeColWrapper);

    // Day columns
    const totalHours = END_HOUR - START_HOUR;
    visibleDays.forEach((dayIndex) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + dayIndex);
      const col = document.createElement("div");
      col.className = "day-column" + (d.toDateString() === todayStr ? " today" : "");
      col.dataset.day = dayIndex;
      col.style.height = `${totalHours * 56}px`;

      for (let h = START_HOUR; h < END_HOUR; h++) {
        const cell = document.createElement("div");
        cell.className = "day-cell";
        cell.addEventListener("click", () => openModalForNew(dayIndex, h));
        col.appendChild(cell);
      }

      grid.appendChild(col);
      renderEventsForDay(col, dayIndex);
    });
  }

  function periodBounds() {
    let start;
    let end;
    if (activeView === "day") {
      start = new Date(activeDate);
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setDate(start.getDate() + 1);
    } else if (activeView === "month") {
      start = new Date(activeDate.getFullYear(), activeDate.getMonth(), 1);
      end = new Date(activeDate.getFullYear(), activeDate.getMonth() + 1, 1);
    } else if (activeView === "year") {
      start = new Date(activeDate.getFullYear(), 0, 1);
      end = new Date(activeDate.getFullYear() + 1, 0, 1);
    } else {
      start = getMonday(activeDate);
      end = new Date(start);
      end.setDate(start.getDate() + 7);
    }
    return { start, end };
  }

  function localOccurrences(start, end) {
    const occurrences = [];
    const cursor = new Date(start);
    cursor.setHours(0, 0, 0, 0);
    while (cursor < end) {
      const dayIndex = (cursor.getDay() + 6) % 7;
      events.filter((event) => event.day === dayIndex).forEach((event) => {
        occurrences.push({ ...event, date: dateKey(cursor), source: "local" });
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    return occurrences;
  }

  function buildAgendaList() {
    const { start, end } = periodBounds();
    const combined = [
      ...localOccurrences(start, end),
      ...googleEvents
        .filter((event) => event.date >= dateKey(start) && event.date < dateKey(end))
        .map((event) => ({ ...event, source: "google" })),
    ].sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`));

    grid.className = "schedule-grid agenda-view";
    grid.style.gridTemplateColumns = "";
    grid.style.minWidth = "";
    grid.innerHTML = "";

    if (combined.length === 0) {
      grid.innerHTML = '<div class="agenda-empty">Aucun créneau pour cette période.</div>';
      return;
    }

    let currentGroup = "";
    combined.forEach((event) => {
      const group = activeView === "year" ? event.date.slice(0, 7) : event.date;
      if (group !== currentGroup) {
        currentGroup = group;
        const heading = document.createElement("h3");
        heading.className = "agenda-heading";
        const groupDate = new Date(`${group}${activeView === "year" ? "-01" : ""}T12:00:00`);
        heading.textContent = activeView === "year"
          ? new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(groupDate)
          : new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(groupDate);
        grid.appendChild(heading);
      }

      const item = document.createElement("article");
      item.className = `agenda-item${event.source === "google" ? " from-google" : ""}`;
      item.innerHTML = `
        <span class="agenda-color" style="background:${event.source === "google" ? "#5f6368" : (event.color || COLORS[0])}"></span>
        <div>
          <strong>${escapeHtml(event.title)}</strong>
          <div>${event.start} – ${event.end}${event.location ? ` · ${escapeHtml(event.location)}` : ""}</div>
        </div>
        ${event.source === "google" ? '<span class="agenda-badge">GOOGLE</span>' : ""}
      `;
      if (event.source === "local") item.addEventListener("click", () => openModalForEdit(event));
      grid.appendChild(item);
    });
  }

  function renderEventsForDay(col, dayIndex) {
    const dayEvents = events.filter((e) => e.day === dayIndex);
    dayEvents.forEach((ev) => {
      const block = makeEventBlock(ev, ev.color || COLORS[0], false);
      block.addEventListener("click", (e) => {
        e.stopPropagation();
        openModalForEdit(ev);
      });
      col.appendChild(block);
    });

    const dayGoogleEvents = googleEvents.filter((e) => e.day === dayIndex);
    dayGoogleEvents.forEach((ev) => {
      const block = makeEventBlock(ev, "#5f6368", true);
      block.title = "Depuis Google Agenda (lecture seule)";
      col.appendChild(block);
    });
  }

  function makeEventBlock(ev, color, isGoogle) {
    const startMin = timeToMinutes(ev.start) - START_HOUR * 60;
    const endMin = timeToMinutes(ev.end) - START_HOUR * 60;
    const top = (startMin / 60) * 56;
    const height = Math.max(((endMin - startMin) / 60) * 56, 20);

    const block = document.createElement("div");
    block.className = "event-block" + (isGoogle ? " google-event" : "");
    block.style.top = `${top}px`;
    block.style.height = `${height}px`;
    block.style.background = color;
    block.innerHTML = `
      ${isGoogle ? `<div class="ev-badge">GOOGLE</div>` : ""}
      <div class="ev-title">${escapeHtml(ev.title)}</div>
      <div class="ev-time">${ev.start} - ${ev.end}</div>
      ${ev.location ? `<div class="ev-location">${escapeHtml(ev.location)}</div>` : ""}
    `;
    return block;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function populateDaySelect() {
    daySelect.innerHTML = "";
    DAYS.forEach((day, i) => {
      const opt = document.createElement("option");
      opt.value = i;
      opt.textContent = day;
      daySelect.appendChild(opt);
    });
  }

  function buildColorPicker() {
    colorPicker.innerHTML = "";
    COLORS.forEach((color) => {
      const swatch = document.createElement("div");
      swatch.className = "color-swatch";
      swatch.style.background = color;
      swatch.dataset.color = color;
      swatch.addEventListener("click", () => {
        selectedColor = color;
        [...colorPicker.children].forEach((c) => c.classList.remove("selected"));
        swatch.classList.add("selected");
      });
      colorPicker.appendChild(swatch);
    });
  }

  function selectColor(color) {
    selectedColor = color;
    [...colorPicker.children].forEach((c) =>
      c.classList.toggle("selected", c.dataset.color === color)
    );
  }

  function openModalForNew(dayIndex, hour) {
    form.reset();
    document.getElementById("event-id").value = "";
    modalTitle.textContent = "Nouveau créneau";
    btnDelete.classList.add("hidden");
    formError.classList.add("hidden");
    daySelect.value = dayIndex;
    document.getElementById("event-start").value = `${String(hour).padStart(2, "0")}:00`;
    document.getElementById("event-end").value = `${String(hour + 1).padStart(2, "0")}:00`;
    selectColor(COLORS[0]);
    modalOverlay.classList.remove("hidden");
    document.getElementById("event-title").focus();
  }

  function openModalForEdit(ev) {
    form.reset();
    document.getElementById("event-id").value = ev.id;
    modalTitle.textContent = "Modifier le créneau";
    btnDelete.classList.remove("hidden");
    formError.classList.add("hidden");
    daySelect.value = ev.day;
    document.getElementById("event-title").value = ev.title;
    document.getElementById("event-start").value = ev.start;
    document.getElementById("event-end").value = ev.end;
    document.getElementById("event-location").value = ev.location || "";
    selectColor(ev.color || COLORS[0]);
    modalOverlay.classList.remove("hidden");
  }

  function closeModal() {
    modalOverlay.classList.add("hidden");
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const id = document.getElementById("event-id").value;
    const title = document.getElementById("event-title").value.trim();
    const day = Number(daySelect.value);
    const start = document.getElementById("event-start").value;
    const end = document.getElementById("event-end").value;
    const location = document.getElementById("event-location").value.trim();

    if (!title || !start || !end) {
      formError.textContent = "Merci de remplir tous les champs obligatoires.";
      formError.classList.remove("hidden");
      return;
    }
    if (timeToMinutes(end) <= timeToMinutes(start)) {
      formError.textContent = "L'heure de fin doit être après l'heure de début.";
      formError.classList.remove("hidden");
      return;
    }

    let ev;
    if (id) {
      ev = events.find((e2) => e2.id === id);
      Object.assign(ev, { title, day, start, end, location, color: selectedColor });
    } else {
      ev = { id: uid(), title, day, start, end, location, color: selectedColor };
      events.push(ev);
    }

    saveEvents();
    closeModal();
    buildGrid();
    syncEventToGoogle(ev);
  });

  btnDelete.addEventListener("click", () => {
    const id = document.getElementById("event-id").value;
    const ev = events.find((e) => e.id === id);
    events = events.filter((e) => e.id !== id);
    saveEvents();
    closeModal();
    buildGrid();
    if (ev) deleteEventFromGoogle(ev);
  });

  document.getElementById("btn-cancel").addEventListener("click", closeModal);
  modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modalOverlay.classList.contains("hidden")) closeModal();
  });

  document.getElementById("btn-add").addEventListener("click", () => {
    openModalForNew((activeDate.getDay() + 6) % 7, START_HOUR);
  });

  periodModes.forEach((button) => {
    button.addEventListener("click", () => {
      activeView = button.dataset.view;
      localStorage.setItem("emploi-du-temps.view", activeView);
      refreshPeriod();
    });
  });

  periodDate.addEventListener("change", () => {
    if (!periodDate.value) return;
    activeDate = new Date(`${periodDate.value}T12:00:00`);
    refreshPeriod();
  });

  document.getElementById("btn-period-today").addEventListener("click", () => {
    activeDate = new Date();
    refreshPeriod();
  });

  document.getElementById("btn-period-prev").addEventListener("click", () => movePeriod(-1));
  document.getElementById("btn-period-next").addEventListener("click", () => movePeriod(1));

  function movePeriod(direction) {
    const next = new Date(activeDate);
    if (activeView === "day") next.setDate(next.getDate() + direction);
    if (activeView === "week") next.setDate(next.getDate() + 7 * direction);
    if (activeView === "month") next.setMonth(next.getMonth() + direction);
    if (activeView === "year") next.setFullYear(next.getFullYear() + direction);
    activeDate = next;
    refreshPeriod();
  }

  function refreshPeriod() {
    buildGrid();
    if (isConnected()) pullGoogleEvents();
  }

  document.getElementById("btn-clear").addEventListener("click", () => {
    if (events.length === 0) return;
    if (confirm("Supprimer tous les créneaux ? Cette action est irréversible.")) {
      events = [];
      saveEvents();
      buildGrid();
    }
  });

  document.getElementById("btn-export").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(events, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "emploi-du-temps.json";
    a.click();
    URL.revokeObjectURL(url);
  });

  const importInput = document.getElementById("import-file");
  document.getElementById("btn-import").addEventListener("click", () => importInput.click());
  importInput.addEventListener("change", () => {
    const file = importInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(reader.result);
        if (!Array.isArray(imported)) throw new Error("Format invalide");
        events = imported;
        saveEvents();
        buildGrid();
      } catch {
        alert("Le fichier importé n'est pas valide.");
      }
    };
    reader.readAsText(file);
    importInput.value = "";
  });

  // ---------- Google Calendar sync ----------

  function showSyncStatus(message, isError) {
    syncStatus.textContent = message;
    syncStatus.classList.remove("hidden");
    syncStatus.classList.toggle("error", !!isError);
  }

  function hideSyncStatus() {
    syncStatus.classList.add("hidden");
  }

  function isGoogleConfigured() {
    return typeof GOOGLE_CLIENT_ID === "string" && !GOOGLE_CLIENT_ID.startsWith("REMPLACE_MOI");
  }

  function isConnected() {
    return !!accessToken && Date.now() < tokenExpiresAt;
  }

  function restoreSession() {
    try {
      const raw = sessionStorage.getItem(TOKEN_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.expiresAt > Date.now()) {
        accessToken = saved.accessToken;
        tokenExpiresAt = saved.expiresAt;
        setConnectedUI(true);
        pullGoogleEvents();
      }
    } catch {
      /* ignore corrupt session data */
    }
  }

  function setConnectedUI(connected) {
    btnGoogle.textContent = connected ? "✓ Google Agenda connecté" : "Connecter Google Agenda";
    btnGoogle.classList.toggle("connected", connected);
  }

  function ensureTokenClient() {
    if (tokenClient) return tokenClient;
    if (typeof google === "undefined" || !google.accounts) {
      throw new Error("Le module Google n'est pas encore chargé, réessaie dans un instant.");
    }
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: CALENDAR_SCOPE,
      callback: (response) => {
        if (response.error) {
          showSyncStatus("Connexion Google Agenda refusée ou annulée.", true);
          return;
        }
        accessToken = response.access_token;
        tokenExpiresAt = Date.now() + response.expires_in * 1000;
        sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ accessToken, expiresAt: tokenExpiresAt }));
        setConnectedUI(true);
        pullGoogleEvents();
      },
    });
    return tokenClient;
  }

  btnGoogle.addEventListener("click", () => {
    if (!isGoogleConfigured()) {
      alert(
        "La connexion à Google Agenda n'est pas encore configurée.\n" +
        "Il manque le Client ID Google Cloud dans config.js."
      );
      return;
    }
    if (isConnected()) {
      if (confirm("Se déconnecter de Google Agenda ?")) {
        if (window.google && google.accounts && accessToken) {
          google.accounts.oauth2.revoke(accessToken, () => {});
        }
        accessToken = null;
        tokenExpiresAt = 0;
        sessionStorage.removeItem(TOKEN_KEY);
        googleEvents = [];
        setConnectedUI(false);
        hideSyncStatus();
        buildGrid();
      }
      return;
    }
    try {
      ensureTokenClient().requestAccessToken({ prompt: "consent" });
    } catch (err) {
      alert(err.message);
    }
  });

  function toLocalISOString(d) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
  }

  function dateForDay(dayIndex) {
    const monday = getMondayOfCurrentWeek();
    const d = new Date(monday);
    d.setDate(monday.getDate() + dayIndex);
    return d;
  }

  function buildGoogleEventBody(ev) {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const date = dateForDay(ev.day);
    const [sh, sm] = ev.start.split(":").map(Number);
    const [eh, em] = ev.end.split(":").map(Number);
    const startDate = new Date(date);
    startDate.setHours(sh, sm, 0, 0);
    const endDate = new Date(date);
    endDate.setHours(eh, em, 0, 0);

    return {
      summary: ev.title,
      location: ev.location || undefined,
      start: { dateTime: toLocalISOString(startDate), timeZone: tz },
      end: { dateTime: toLocalISOString(endDate), timeZone: tz },
      recurrence: ["RRULE:FREQ=WEEKLY"],
      extendedProperties: { private: { localId: ev.id, app: APP_TAG } },
    };
  }

  async function googleFetch(path, options = {}) {
    if (!isConnected()) return null;
    const res = await fetch(`https://www.googleapis.com/calendar/v3/${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
    if (res.status === 401) {
      accessToken = null;
      tokenExpiresAt = 0;
      sessionStorage.removeItem(TOKEN_KEY);
      setConnectedUI(false);
      showSyncStatus("Session Google Agenda expirée, reconnecte-toi.", true);
      return null;
    }
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Erreur Google Agenda (${res.status}) : ${body}`);
    }
    return res.status === 204 ? null : res.json();
  }

  async function syncEventToGoogle(ev) {
    if (!isConnected()) return;
    try {
      const body = buildGoogleEventBody(ev);
      if (ev.googleEventId) {
        await googleFetch(`calendars/primary/events/${ev.googleEventId}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      } else {
        const created = await googleFetch("calendars/primary/events", {
          method: "POST",
          body: JSON.stringify(body),
        });
        if (created) {
          ev.googleEventId = created.id;
          saveEvents();
        }
      }
      showSyncStatus("Synchronisé avec Google Agenda.", false);
    } catch (err) {
      showSyncStatus(err.message, true);
    }
  }

  async function deleteEventFromGoogle(ev) {
    if (!isConnected() || !ev.googleEventId) return;
    try {
      await googleFetch(`calendars/primary/events/${ev.googleEventId}`, { method: "DELETE" });
    } catch (err) {
      showSyncStatus(err.message, true);
    }
  }

  async function pullGoogleEvents() {
    if (!isConnected()) return;
    const { start: periodStart, end: periodEnd } = periodBounds();

    try {
      const params = new URLSearchParams({
        timeMin: periodStart.toISOString(),
        timeMax: periodEnd.toISOString(),
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "2500",
      });
      const data = await googleFetch(`calendars/primary/events?${params.toString()}`);
      if (!data) return;

      googleEvents = (data.items || [])
        .filter((item) => item.start && item.start.dateTime)
        .filter((item) => (item.extendedProperties && item.extendedProperties.private && item.extendedProperties.private.app) !== APP_TAG)
        .map((item) => {
          const start = new Date(item.start.dateTime);
          const end = new Date(item.end.dateTime);
          const dayIndex = (start.getDay() + 6) % 7; // Monday=0
          const pad = (n) => String(n).padStart(2, "0");
          return {
            id: item.id,
            title: item.summary || "(Sans titre)",
            day: dayIndex,
            date: dateKey(start),
            start: `${pad(start.getHours())}:${pad(start.getMinutes())}`,
            end: `${pad(end.getHours())}:${pad(end.getMinutes())}`,
            location: item.location || "",
          };
        });

      showSyncStatus(`Google Agenda connecté — ${googleEvents.length} événement(s) pour la période.`, false);
      buildGrid();
    } catch (err) {
      showSyncStatus(err.message, true);
    }
  }

  // ---------- Service worker (PWA) ----------
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }

  populateDaySelect();
  buildColorPicker();
  selectColor(COLORS[0]);
  buildGrid();
  setConnectedUI(false);
  restoreSession();
})();
