const FORM_URL = "https://www.unsin.co.kr/unse/free/todayline/form?linenum=01&sid=tunse";
const RESULT_URL = "https://www.unsin.co.kr/unse/free/today/result";

function nowIso() {
  return new Date().toISOString();
}

async function getProfileAndSettings() {
  const local = await chrome.storage.local.get(["profile", "settings"]);
  const session = await chrome.storage.session.get(["pendingAutoRun"]);
  return {
    profile: local.profile || null,
    settings: local.settings || {
      displayMode: "extension_tab",
      autoSubmit: true,
      closeSourceAfterExtract: false
    },
    pendingAutoRun: session.pendingAutoRun || null
  };
}

async function rememberActiveRun(tabId, run) {
  if (!tabId || !run) return;
  const { activeAutoRuns } = await chrome.storage.session.get(["activeAutoRuns"]);
  await chrome.storage.session.set({
    activeAutoRuns: {
      ...(activeAutoRuns || {}),
      [String(tabId)]: run
    }
  });
}

async function takeActiveRun(tabId) {
  if (!tabId) return null;
  const key = String(tabId);
  const { activeAutoRuns } = await chrome.storage.session.get(["activeAutoRuns"]);
  const run = activeAutoRuns?.[key] || null;
  if (run) {
    const nextRuns = { ...activeAutoRuns };
    delete nextRuns[key];
    await chrome.storage.session.set({ activeAutoRuns: nextRuns });
  }
  return run;
}

function two(n) {
  return String(n).padStart(2, "0");
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function targetDate(day, baseIso) {
  const date = isIsoDate(baseIso) ? new Date(`${baseIso}T00:00:00`) : new Date();
  if (day === "yesterday") date.setDate(date.getDate() - 1);
  if (day === "tomorrow") date.setDate(date.getDate() + 1);
  return {
    yyyy: String(date.getFullYear()),
    mm: two(date.getMonth() + 1),
    dd: two(date.getDate()),
    iso: `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`
  };
}

function addDaysIso(baseIso, days) {
  const base = isIsoDate(baseIso) ? baseIso : targetDate("today").iso;
  const date = new Date(`${base}T00:00:00`);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

function hourValue(profileHour) {
  return {
    unknown: "0",
    ja: "01",
    chuk: "02",
    in: "04",
    myo: "06",
    jin: "08",
    sa: "10",
    oh: "12",
    mi: "14",
    shin: "16",
    yu: "18",
    sul: "20",
    hae: "22"
  }[profileHour || "unknown"] || "0";
}

function solunarValue(calendarType) {
  return {
    solar: "S_C",
    lunar: "L_C",
    leap_lunar: "L_L"
  }[calendarType || "solar"] || "S_C";
}

function decodeHtml(text) {
  return String(text || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function htmlToText(html) {
  return decodeHtml(String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h2|h3|div|li)>/gi, "\n")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim());
}

function parseBgBox(html) {
  const titleMatch = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
  const h3Match = html.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
  const pMatches = Array.from(html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi));
  const body = [];

  if (h3Match) body.push(htmlToText(h3Match[1]));
  for (const match of pMatches) {
    const text = htmlToText(match[1]);
    if (text) body.push(text);
  }

  return {
    title: titleMatch ? htmlToText(titleMatch[1]) : "한마디 운세",
    body
  };
}

function parseResultHtml(html, day, sourceUrl) {
  const viewMatch = html.match(/<div class="unse_view">([\s\S]*?)<div class="viewer_icon_Box">/i);
  const view = viewMatch ? viewMatch[1] : html;
  const pointMatch = view.match(/<tspan[^>]*class="number"[^>]*>\s*(\d{1,3})\s*<\/tspan>/i);
  const bgBoxes = Array.from(view.matchAll(/<div class="bg-box">([\s\S]*?)(?=<div class="bg-box">|<\/div>\s*<\/div>\s*<div class="viewer_icon_Box">)/gi));
  const sections = bgBoxes
    .map((match) => parseBgBox(match[1]))
    .filter((section) => section.body.length);
  const text = sections
    .map((section) => [section.title, ...section.body].join("\n\n"))
    .join("\n\n");

  if (!sections.length || !text) {
    throw new Error("unsin 결과를 해석할 수 없습니다.");
  }

  return {
    title: "오늘의 운세",
    sourceUrl,
    extractedAt: nowIso(),
    day,
    targetDate: sourceUrl.match(/setDate=([^&]+)/)?.[1] || "",
    point: pointMatch ? `${Math.min(Number(pointMatch[1]), 100)}%` : "",
    sections,
    text
  };
}

async function fetchFortuneResult(profile, day, targetIso) {
  if (!profile) throw new Error("저장된 프로필이 없습니다.");

  const target = targetDate(day, targetIso);
  const url = `${RESULT_URL}?setDate=${encodeURIComponent(target.iso)}`;
  const body = new URLSearchParams({
    cate1: "free",
    cate2: "today",
    free_yn: "Y",
    login_yn: "N",
    payment_type: "",
    user_name: profile.name || "",
    sex: profile.gender === "female" ? "여" : "남",
    birth_yyyy: String(profile.birthYear || ""),
    birth_mm: two(profile.birthMonth || "1"),
    birth_dd: two(profile.birthDay || "1"),
    birth_hh: hourValue(profile.birthHour),
    birth_solunar: solunarValue(profile.calendarType),
    target_yyyy: target.yyyy
  });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
    },
    body
  });

  if (!response.ok) {
    throw new Error(`unsin 요청 실패: ${response.status}`);
  }

  const html = await response.text();
  return parseResultHtml(html, day, url);
}

async function fetchWeeklyPoints(profile, centerIso) {
  const center = isIsoDate(centerIso) ? centerIso : targetDate("today").iso;
  const dates = Array.from({ length: 7 }, (_, index) => addDaysIso(center, index - 3));
  const results = await Promise.all(dates.map(async (date) => {
    const result = await fetchFortuneResult(profile, "today", date);
    return {
      date,
      point: Number.parseInt(result.point, 10) || 0
    };
  }));
  return results;
}

chrome.runtime.onInstalled.addListener(async () => {
  const { settings } = await chrome.storage.local.get(["settings"]);
  if (!settings) {
    await chrome.storage.local.set({
      settings: {
        autoSubmit: true,
        displayMode: "extension_tab",
        closeSourceAfterExtract: false
      }
    });
  }
});

async function openOrReplaceWithResult(senderTabId, settings) {
  const resultUrl = chrome.runtime.getURL("results.html");

  if (settings.displayMode === "keep_source") {
    return;
  }

  // 優先：元の unsin タブを拡張の結果ページに置き換える。
  // 失敗した場合は新規タブで開く。
  if (senderTabId) {
    try {
      await chrome.tabs.update(senderTabId, { url: resultUrl, active: true });
      return;
    } catch (e) {
      console.warn("[Unsin Fortune Helper] 기존 탭 전환 실패. 새 탭을 엽니다.", e);
    }
  }

  await chrome.tabs.create({ url: resultUrl, active: true });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (!message || !message.type) return;

    if (message.type === "OPEN_UNSIN_TODAY") {
      const displayResult = message.displayResult !== false;
      const day = message.day || "today";

      if (!message.forceRefresh && displayResult) {
        const { lastResult } = await chrome.storage.session.get(["lastResult"]);
        if (lastResult && lastResult.text) {
          await chrome.tabs.create({ url: chrome.runtime.getURL("results.html"), active: true });
          sendResponse({ ok: true, reusedLastResult: true });
          return;
        }
      }

      const { profile } = await chrome.storage.local.get(["profile"]);
      const result = {
        ...(await fetchFortuneResult(profile, day, message.targetDate)),
        receivedAt: nowIso()
      };
      await chrome.storage.session.set({ lastResult: result });

      sendResponse({ ok: true, directFetch: true });
      return;
    }

    if (message.type === "GET_WEEKLY_POINTS") {
      const { profile } = await chrome.storage.local.get(["profile"]);
      const points = await fetchWeeklyPoints(profile, message.centerDate);
      await chrome.storage.session.set({ weeklyPoints: points });
      sendResponse({ ok: true, points });
      return;
    }

    if (message.type === "GET_PROFILE_AND_STATE") {
      const data = await getProfileAndSettings();

      // 자동 실행은 확장 프로그램에서 연 직후 1회만 사용한다.
      if (data.pendingAutoRun) {
        await rememberActiveRun(sender?.tab?.id, data.pendingAutoRun);
        await chrome.storage.session.remove(["pendingAutoRun"]);
      }

      sendResponse({ ok: true, ...data });
      return;
    }

    if (message.type === "RESULT_EXTRACTED") {
      const activeRun = await takeActiveRun(sender?.tab?.id);
      const result = {
        ...message.payload,
        day: activeRun?.day || message.payload?.day || "today",
        receivedAt: nowIso()
      };

      // 결과는 영구 저장하지 않고 브라우저 세션에만 임시 저장한다.
      await chrome.storage.session.set({ lastResult: result });

      if (activeRun?.displayResult === false) {
        sendResponse({ ok: true, stayedOnSource: true });
        return;
      }

      if (activeRun?.backgroundOnly) {
        if (sender?.tab?.id) {
          try {
            await chrome.tabs.remove(sender.tab.id);
          } catch (e) {
            console.warn("[Unsin Fortune Helper] background source tab cleanup failed", e);
          }
        }
        sendResponse({ ok: true, backgroundOnly: true });
        return;
      }

      const local = await chrome.storage.local.get(["settings"]);
      const settings = local.settings || { displayMode: "extension_tab" };

      if (activeRun?.resultTabId && activeRun.resultTabId !== sender?.tab?.id) {
        await chrome.tabs.update(activeRun.resultTabId, {
          url: chrome.runtime.getURL("results.html"),
          active: true
        });
        if (sender?.tab?.id) {
          try {
            await chrome.tabs.remove(sender.tab.id);
          } catch (e) {
            console.warn("[Unsin Fortune Helper] temporary source tab cleanup failed", e);
          }
        }
      } else {
        await openOrReplaceWithResult(sender?.tab?.id, settings);
      }

      sendResponse({ ok: true });
      return;
    }

    if (message.type === "SHOW_LAST_RESULT") {
      await chrome.tabs.create({ url: chrome.runtime.getURL("results.html"), active: true });
      sendResponse({ ok: true });
      return;
    }

    if (message.type === "CLEAR_RESULT") {
      await chrome.storage.session.remove(["lastResult"]);
      sendResponse({ ok: true });
      return;
    }
  })().catch((error) => {
    console.error("[Unsin Fortune Helper] background error", error);
    sendResponse({ ok: false, error: String(error && error.message ? error.message : error) });
  });

  return true;
});
