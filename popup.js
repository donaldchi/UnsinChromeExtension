const $ = (id) => document.getElementById(id);
let selectedGender = "male";
let selectedCalendar = "solar";

function two(n) {
  return String(n).padStart(2, "0");
}

function setStatus(message, type = "info") {
  const el = $("status");
  el.textContent = message;
  el.className = `status ${type}`;
}

function populateSelects() {
  const year = $("birthYear");
  const month = $("birthMonth");
  const day = $("birthDay");
  const currentYear = new Date().getFullYear();

  for (let y = 1930; y <= currentYear; y++) {
    year.add(new Option(`${y}년`, String(y)));
  }
  for (let m = 1; m <= 12; m++) {
    month.add(new Option(`${two(m)}월`, String(m)));
  }
  for (let d = 1; d <= 31; d++) {
    day.add(new Option(`${two(d)}일`, String(d)));
  }
}

function markActive() {
  document.querySelectorAll("[data-gender]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.gender === selectedGender);
  });
  document.querySelectorAll("[data-calendar]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.calendar === selectedCalendar);
  });
}

function readProfileFromForm() {
  return {
    name: $("name").value.trim(),
    gender: selectedGender,
    birthYear: $("birthYear").value,
    birthMonth: $("birthMonth").value,
    birthDay: $("birthDay").value,
    birthHour: $("birthHour").value,
    calendarType: selectedCalendar
  };
}

function readSettingsFromForm() {
  return {
    autoSubmit: true,
    displayMode: "extension_tab",
    closeSourceAfterExtract: false
  };
}

async function saveAll() {
  const profile = readProfileFromForm();
  const settings = readSettingsFromForm();

  if (!profile.name) {
    throw new Error("이름을 입력해 주세요.");
  }
  if (!profile.birthYear || !profile.birthMonth || !profile.birthDay) {
    throw new Error("생년월일을 입력해 주세요.");
  }

  await chrome.storage.local.set({ profile, settings });
  return { profile, settings };
}

async function openFortune(day) {
  await saveAll();
  setStatus("unsin.co.kr 페이지를 여는 중...", "info");
  const response = await chrome.runtime.sendMessage({
    type: "OPEN_UNSIN_TODAY",
    day,
    forceRefresh: true,
    displayResult: true,
    backgroundOnly: true
  });
  if (!response?.ok) throw new Error(response?.error || "페이지를 열 수 없습니다.");
  location.replace(chrome.runtime.getURL("results.html?popup=1"));
}

async function loadAll() {
  const { profile } = await chrome.storage.local.get(["profile", "settings"]);

  const now = new Date();
  const defaultYear = String(Math.max(1930, Math.min(now.getFullYear(), 1990)));

  $("name").value = profile?.name || "";
  selectedGender = profile?.gender || "male";
  selectedCalendar = profile?.calendarType || "solar";
  $("birthYear").value = profile?.birthYear || defaultYear;
  $("birthMonth").value = profile?.birthMonth || "1";
  $("birthDay").value = profile?.birthDay || "1";
  $("birthHour").value = profile?.birthHour || "unknown";

  markActive();
}

document.addEventListener("DOMContentLoaded", async () => {
  const params = new URLSearchParams(location.search);
  if (params.get("settings") !== "1") {
    const { lastResult } = await chrome.storage.session.get(["lastResult"]);
    if (lastResult && lastResult.text) {
      location.replace(chrome.runtime.getURL("results.html?popup=1"));
      return;
    }
  }

  populateSelects();

  document.querySelectorAll("[data-gender]").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedGender = btn.dataset.gender;
      markActive();
    });
  });

  document.querySelectorAll("[data-calendar]").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedCalendar = btn.dataset.calendar;
      markActive();
    });
  });

  $("save").addEventListener("click", async () => {
    try {
      await saveAll();
      setStatus("저장했습니다.", "success");
    } catch (e) {
      setStatus(e.message || String(e), "error");
    }
  });

  $("openToday").addEventListener("click", async () => {
    try {
      await saveAll();
      setStatus("unsin.co.kr 페이지를 여는 중입니다…", "info");
      const response = await chrome.runtime.sendMessage({
        type: "OPEN_UNSIN_TODAY",
        day: "today",
        forceRefresh: true,
        displayResult: true,
        backgroundOnly: true
      });
      if (!response?.ok) throw new Error(response?.error || "페이지를 열 수 없습니다.");
      location.replace(chrome.runtime.getURL("results.html?popup=1"));
    } catch (e) {
      setStatus(e.message || String(e), "error");
    }
  });

  $("openYesterday").addEventListener("click", async () => {
    try {
      await openFortune("yesterday");
    } catch (e) {
      setStatus(e.message || String(e), "error");
    }
  });

  $("openTomorrow").addEventListener("click", async () => {
    try {
      await openFortune("tomorrow");
    } catch (e) {
      setStatus(e.message || String(e), "error");
    }
  });

  await loadAll();
});
