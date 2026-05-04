function $(id) {
  return document.getElementById(id);
}

function formatDate(iso) {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(iso));
  } catch (_) {
    return iso;
  }
}

function todayIso() {
  const date = new Date();
  const two = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

function shiftIsoDate(iso, days) {
  const base = /^\d{4}-\d{2}-\d{2}$/.test(String(iso || "")) ? iso : todayIso();
  const date = new Date(`${base}T00:00:00`);
  const two = (n) => String(n).padStart(2, "0");
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

function splitIntoBlocks(text) {
  return String(text || "")
    .split(/\n{2,}/)
    .map(s => s.trim())
    .filter(Boolean);
}

function renderText(text) {
  const root = $("resultText");
  root.textContent = "";

  const blocks = splitIntoBlocks(text);
  for (const block of blocks) {
    const p = document.createElement("p");
    p.textContent = block;
    root.appendChild(p);
  }
}

function shortDate(iso) {
  return String(iso || "").slice(5).replace("-", "/");
}

function renderWeeklyChart(points) {
  const root = $("weeklyChart");
  if (!root) return;
  root.textContent = "";

  if (!Array.isArray(points) || points.length === 0) {
    root.classList.add("hidden");
    return;
  }

  const title = document.createElement("h2");
  title.textContent = "최근 7일 오늘의 운세 포인트";
  root.appendChild(title);

  const chart = document.createElement("div");
  chart.className = "weekly-bars";

  for (const item of points) {
    const value = Math.max(0, Math.min(Number(item.point) || 0, 100));
    const bar = document.createElement("div");
    bar.className = "weekly-bar";

    const valueEl = document.createElement("span");
    valueEl.className = "weekly-value";
    valueEl.textContent = `${value}%`;

    const track = document.createElement("div");
    track.className = "weekly-track";

    const fill = document.createElement("div");
    fill.className = "weekly-fill";
    fill.style.height = `${value}%`;
    track.appendChild(fill);

    const label = document.createElement("span");
    label.className = "weekly-label";
    label.textContent = shortDate(item.date);

    bar.append(valueEl, track, label);
    chart.appendChild(bar);
  }

  root.appendChild(chart);
  root.classList.remove("hidden");
}

async function loadWeeklyChart(centerDate) {
  const root = $("weeklyChart");
  if (!root) return;

  const response = await chrome.runtime.sendMessage({
    type: "GET_WEEKLY_POINTS",
    centerDate: centerDate || $("targetDate")?.value || todayIso()
  });
  if (response?.ok) renderWeeklyChart(response.points);
}

function appendParagraphs(root, lines, options = {}) {
  lines.forEach((line, index) => {
    const p = document.createElement("p");
    p.textContent = line;
    if (options.lead && index === 0) p.className = "section-lead";
    root.appendChild(p);
  });
}

function renderStructuredResult(result) {
  const root = $("resultText");
  root.textContent = "";

  if (result.point) {
    const point = document.createElement("div");
    point.className = "fortune-point";
    point.innerHTML = `
      <span class="point-label">오늘의 운세 포인트</span>
      <strong>${result.point}</strong>
    `;
    root.appendChild(point);
  }

  for (const section of result.sections || []) {
    const card = document.createElement("article");
    card.className = "fortune-section";

    const h2 = document.createElement("h2");
    h2.textContent = section.title;
    card.appendChild(h2);

    const body = document.createElement("div");
    body.className = "section-body";
    appendParagraphs(body, section.body || [], { lead: section.title === "한마디 운세" });
    card.appendChild(body);

    root.appendChild(card);
  }

  if (!root.childElementCount) renderText(result.text);
}

async function loadResult() {
  const { lastResult } = await chrome.storage.session.get(["lastResult"]);

  if (!lastResult || !lastResult.text) {
    $("empty").classList.remove("hidden");
    $("resultCard").classList.add("hidden");
    $("resultTitle").textContent = "오늘의 운세";
    return;
  }

  $("empty").classList.add("hidden");
  $("resultCard").classList.remove("hidden");

  const target = lastResult.targetDate || todayIso();
  $("resultTitle").textContent = `오늘의 운세 (${target})`.toUpperCase();
  $("targetDate").value = target;
  $("sourceLink").href = lastResult.sourceUrl || "https://www.unsin.co.kr/unse/free/todayline/form?linenum=01&sid=tunse";
  $("headerSourceLink").href = $("sourceLink").href;

  if (Array.isArray(lastResult.sections) && lastResult.sections.length) {
    renderStructuredResult(lastResult);
  } else {
    renderText(lastResult.text);
  }

  loadWeeklyChart(target);
}

async function openFortune(day, targetDate) {
  const root = $("resultText");
  root.textContent = "";
  const loading = document.createElement("div");
  loading.className = "fortune-loading";
  loading.textContent = "불러오는 중...";
  root.appendChild(loading);

  const response = await chrome.runtime.sendMessage({
    type: "OPEN_UNSIN_TODAY",
    day,
    targetDate,
    forceRefresh: true,
    displayResult: true,
    backgroundOnly: true
  });
  if (!response?.ok) {
    root.textContent = "";
    const error = document.createElement("div");
    error.className = "fortune-loading";
    error.textContent = response?.error || "불러오지 못했습니다.";
    root.appendChild(error);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const params = new URLSearchParams(location.search);
  if (params.get("popup") === "1") {
    document.body.classList.add("popup-result");
  }

  $("yesterday").addEventListener("click", async () => {
    const { lastResult } = await chrome.storage.session.get(["lastResult"]);
    await openFortune("today", shiftIsoDate(lastResult?.targetDate, -1));
  });

  $("tomorrow").addEventListener("click", async () => {
    const { lastResult } = await chrome.storage.session.get(["lastResult"]);
    await openFortune("today", shiftIsoDate(lastResult?.targetDate, 1));
  });

  $("openDate").addEventListener("click", async () => {
    await openFortune("today", $("targetDate").value || todayIso());
  });

  $("settings").addEventListener("click", () => {
    location.href = chrome.runtime.getURL("popup.html?settings=1");
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "session" && changes.lastResult) loadResult();
    if (areaName === "session" && changes.weeklyPoints) renderWeeklyChart(changes.weeklyPoints.newValue);
  });

  await loadResult();
});
