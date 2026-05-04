(() => {
  const LOG_PREFIX = "[Unsin Fortune Helper]";
  const FORM_KEYWORDS = ["결과보기", "남자", "여자", "양력", "음력"];
  const RESULT_KEYWORDS = ["오늘의 운세", "총운", "애정", "금전", "직장", "건강", "운세"];

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function normalizeText(text) {
    return String(text || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function visibleText(el) {
    if (!el) return "";
    const style = window.getComputedStyle(el);
    if (style && (style.display === "none" || style.visibility === "hidden" || style.opacity === "0")) return "";
    return normalizeText(el.innerText || el.textContent || el.value || el.getAttribute("aria-label") || "");
  }

  function hasInputFormControls() {
    const bodyText = visibleText(document.body);
    const hasFormKeywords = FORM_KEYWORDS.filter((k) => bodyText.includes(k)).length >= 3;
    const hasSubmitText = bodyText.includes("결과보기");
    const hasSelects = document.querySelectorAll("select").length >= 3;
    const hasInputs = document.querySelectorAll("input, button, select").length >= 3;
    return hasSubmitText && hasFormKeywords && (hasSelects || hasInputs);
  }

  function isFormPage() {
    // 중요:
    // unsin 쪽에서 결과를 /form 계열 URL 그대로 보여주는 경우가 있다.
    // 그래서 URL만 보고 폼 페이지라고 판단하지 않고, 실제 입력 컨트롤 존재 여부로 판단한다.
    return hasInputFormControls();
  }

  function dispatchChange(el) {
    ["input", "change"].forEach((type) => {
      el.dispatchEvent(new Event(type, { bubbles: true }));
    });
  }

  function setTextInput(input, value) {
    if (!input || !value) return false;
    input.focus();
    input.value = value;
    dispatchChange(input);
    input.blur();
    return true;
  }

  function findNameInput() {
    const inputs = Array.from(document.querySelectorAll("input"))
      .filter((input) => {
        const type = (input.type || "text").toLowerCase();
        return ["text", "search", ""].includes(type) && !input.disabled && !input.readOnly;
      });

    const positive = ["이름", "성명", "name", "userName", "username", "nm"];
    const negative = ["year", "month", "day", "birth", "phone", "email", "mail"];

    function score(input) {
      const attrs = [
        input.name,
        input.id,
        input.placeholder,
        input.title,
        input.getAttribute("aria-label"),
        visibleText(input.closest("label, li, div, td, tr"))
      ].join(" ").toLowerCase();

      let s = 0;
      for (const p of positive) {
        if (attrs.includes(p.toLowerCase())) s += 10;
      }
      for (const n of negative) {
        if (attrs.includes(n.toLowerCase())) s -= 10;
      }
      return s;
    }

    const ranked = inputs
      .map((input) => ({ input, score: score(input) }))
      .sort((a, b) => b.score - a.score);

    if (ranked.length && ranked[0].score > 0) return ranked[0].input;

    // 이름 입력欄が明示されていない場合は、単一の短いテキスト入力欄のみを候補にする。
    if (inputs.length === 1) return inputs[0];

    return null;
  }

  function setSelect(select, candidates) {
    if (!select) return false;
    const opts = Array.from(select.options || []);
    const normalizedCandidates = candidates
      .filter(Boolean)
      .map((v) => normalizeText(String(v)).toLowerCase());

    for (const opt of opts) {
      const text = normalizeText(opt.textContent).toLowerCase();
      const value = normalizeText(opt.value).toLowerCase();
      if (normalizedCandidates.some((c) => text === c || value === c || text.includes(c) || value.includes(c))) {
        select.value = opt.value;
        opt.selected = true;
        dispatchChange(select);
        return true;
      }
    }
    return false;
  }

  function two(n) {
    return String(n).padStart(2, "0");
  }

  function targetOffset(day) {
    if (day === "yesterday") return -1;
    if (day === "tomorrow") return 1;
    return 0;
  }

  function targetDateParts(day) {
    const date = new Date();
    date.setDate(date.getDate() + targetOffset(day));
    return {
      year: String(date.getFullYear()),
      month: two(date.getMonth() + 1),
      day: two(date.getDate())
    };
  }

  function setFormValue(el, value) {
    if (!el) return false;
    if (el.tagName === "SELECT") return setSelect(el, [value, String(Number(value))]);
    el.value = value;
    dispatchChange(el);
    return true;
  }

  function findField(names) {
    return Array.from(document.querySelectorAll("input, select")).find((field) => {
      return [field.name, field.id].filter(Boolean).some((attr) => names.includes(attr));
    });
  }

  function ensureHiddenField(name, value) {
    const form = document.querySelector("form");
    if (!form) return false;
    let input = form.querySelector(`input[name="${name}"]`);
    if (!input) {
      input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      form.appendChild(input);
    }
    input.value = value;
    return true;
  }

  function setTargetDate(day) {
    const target = targetDateParts(day);
    const yearSet = setFormValue(findField(["target_yyyy", "target_year", "targetYyyy"]), target.year);
    const monthSet = setFormValue(findField(["target_mm", "target_month", "targetMm"]), target.month);
    const daySet = setFormValue(findField(["target_dd", "target_day", "targetDd"]), target.day);
    const dateSet = setFormValue(findField(["target_date", "targetDate"]), `${target.year}-${target.month}-${target.day}`);

    return {
      year: yearSet || ensureHiddenField("target_yyyy", target.year),
      month: monthSet || ensureHiddenField("target_mm", target.month),
      day: daySet || ensureHiddenField("target_dd", target.day),
      date: dateSet || ensureHiddenField("target_date", `${target.year}-${target.month}-${target.day}`)
    };
  }

  function classifySelect(select) {
    const attrs = [
      select.name,
      select.id,
      select.title,
      select.getAttribute("aria-label"),
      visibleText(select.closest("label, li, div, td, tr"))
    ].join(" ").toLowerCase();

    const text = Array.from(select.options || []).slice(0, 80).map(o => normalizeText(o.textContent)).join(" ");

    if (/year|yyyy|birth.*y|birthyear|생년|년도/.test(attrs) || /1930년|1940년|1980년|1990년|2000년|2026년/.test(text)) return "year";
    if (/month|mm|birth.*m|birthmonth|월/.test(attrs) || /01월|02월|12월/.test(text)) return "month";
    if (/day|dd|birth.*d|birthday|일/.test(attrs) || /01일|02일|31일/.test(text)) return "day";
    if (/hour|time|birth.*time|태어난|시간/.test(attrs) || /모름|태어난 시간|子|丑|寅|卯|辰|巳|午|未|申|酉|戌|亥/.test(text)) return "hour";
    return "unknown";
  }

  function clickByExactOrIncludesText(targetTexts, root = document.body) {
    const tags = "label, button, a, span, li, div, input[type='radio'], input[type='checkbox']";
    const candidates = Array.from(root.querySelectorAll(tags));
    const targets = targetTexts.map((t) => normalizeText(t));

    for (const exact of [true, false]) {
      for (const el of candidates) {
        const txt = visibleText(el);
        const value = normalizeText(el.value || el.getAttribute("title") || el.getAttribute("alt") || "");
        const hay = [txt, value].filter(Boolean);
        const matched = hay.some((h) => targets.some((t) => exact ? h === t : h.includes(t)));
        if (matched && txt.length < 80) {
          try {
            el.click();
            return true;
          } catch (_) {}
        }
      }
    }
    return false;
  }

  function clickRadioNearText(texts) {
    if (clickByExactOrIncludesText(texts)) return true;

    const inputs = Array.from(document.querySelectorAll("input[type='radio'], input[type='checkbox']"));
    for (const input of inputs) {
      const parent = input.closest("label, li, div, td, tr") || input.parentElement;
      const ptxt = visibleText(parent);
      const val = normalizeText(input.value || input.name || input.id);
      if (texts.some(t => ptxt.includes(t) || val.includes(t))) {
        input.click();
        dispatchChange(input);
        return true;
      }
    }
    return false;
  }

  function hourCandidates(profile) {
    const hour = profile.birthHour || "unknown";
    const map = {
      unknown: ["모름", "태어난 시간"],
      ja: ["子", "23:30", "01:29"],
      chuk: ["丑", "01:30", "03:29"],
      in: ["寅", "03:30", "05:29"],
      myo: ["卯", "05:30", "07:29"],
      jin: ["辰", "07:30", "09:29"],
      sa: ["巳", "09:30", "11:29"],
      oh: ["午", "11:30", "13:29"],
      mi: ["未", "13:30", "15:29"],
      shin: ["申", "15:30", "17:29"],
      yu: ["酉", "17:30", "19:29"],
      sul: ["戌", "19:30", "21:29"],
      hae: ["亥", "21:30", "23:29"]
    };
    return map[hour] || map.unknown;
  }

  async function fillForm(profile, run) {
    if (!profile) throw new Error("저장된 프로필이 없습니다.");

    const nameInput = findNameInput();
    if (nameInput && profile.name) {
      setTextInput(nameInput, profile.name);
    }

    const selects = Array.from(document.querySelectorAll("select"));
    const byType = { year: null, month: null, day: null, hour: null };

    for (const s of selects) {
      const type = classifySelect(s);
      if (type !== "unknown" && !byType[type]) byType[type] = s;
    }

    if (byType.year) setSelect(byType.year, [`${profile.birthYear}년`, String(profile.birthYear)]);
    if (byType.month) setSelect(byType.month, [`${two(profile.birthMonth)}월`, `${Number(profile.birthMonth)}월`, two(profile.birthMonth), String(Number(profile.birthMonth))]);
    if (byType.day) setSelect(byType.day, [`${two(profile.birthDay)}일`, `${Number(profile.birthDay)}일`, two(profile.birthDay), String(Number(profile.birthDay))]);
    if (byType.hour) setSelect(byType.hour, hourCandidates(profile));

    if (profile.gender === "male") clickRadioNearText(["남자", "男", "male"]);
    if (profile.gender === "female") clickRadioNearText(["여자", "女", "female"]);

    if (profile.calendarType === "solar") clickRadioNearText(["양력"]);
    if (profile.calendarType === "lunar") clickRadioNearText(["음력(평달)", "평달", "음력"]);
    if (profile.calendarType === "leap_lunar") clickRadioNearText(["음력(윤달)", "윤달"]);

    const target = setTargetDate(run?.day || "today");

    await sleep(250);

    return {
      name: !!nameInput,
      year: !!byType.year,
      month: !!byType.month,
      day: !!byType.day,
      hour: !!byType.hour,
      target
    };
  }

  function clickSubmit() {
    const selectors = [
      "button[type='submit']",
      "input[type='submit']",
      "button",
      "a",
      "img[alt*='결과']"
    ];

    for (const sel of selectors) {
      for (const el of Array.from(document.querySelectorAll(sel))) {
        const txt = visibleText(el);
        const value = normalizeText(el.value || el.alt || el.title || "");
        if ([txt, value].some((v) => v.includes("결과보기") || v.includes("결과"))) {
          el.click();
          return true;
        }
      }
    }

    const forms = Array.from(document.querySelectorAll("form"));
    if (forms[0]) {
      forms[0].requestSubmit ? forms[0].requestSubmit() : forms[0].submit();
      return true;
    }

    return false;
  }

  function cleanupClone() {
    const clone = document.body.cloneNode(true);
    clone.querySelectorAll("script, style, noscript, iframe, header, footer, nav, aside, form, input, select, button").forEach(el => el.remove());
    return clone;
  }

  function candidateScore(el) {
    const text = visibleText(el);
    if (!text || text.length < 80) return -9999;

    const links = el.querySelectorAll ? el.querySelectorAll("a").length : 0;
    const keywordScore = RESULT_KEYWORDS.reduce((acc, k) => acc + (text.includes(k) ? 40 : 0), 0);
    const lengthScore = Math.min(text.length / 20, 220);
    const navPenalty = Math.min(links * 8, 240);
    const menuPenalty = (text.match(/fortun\.unsin|카테고리|고객센터|공지사항|회원가입|로그인/g) || []).length * 20;
    return keywordScore + lengthScore - navPenalty - menuPenalty;
  }

  function extractResultText() {
    const clone = cleanupClone();

    const selector = [
      "main", "article", "#content", "#contents", ".content", ".contents",
      ".result", ".result_view", ".fortune", ".view", ".unse", ".detail",
      ".today", ".todayline", "section", "div"
    ].join(",");

    const candidates = Array.from(clone.querySelectorAll(selector));
    let best = null;
    let bestScore = -9999;

    for (const el of candidates) {
      const score = candidateScore(el);
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }

    const raw = visibleText(best) || visibleText(clone);
    const lines = raw
      .split(/\n+/)
      .map(normalizeText)
      .filter(Boolean)
      .filter(line => line.length > 1)
      .filter(line => !/^(\*|\||홈|무료|게시판|고객센터|공지사항|로그인|회원가입)$/.test(line))
      .filter(line => !line.includes("무단전재") && !line.includes("사업자번호") && !line.includes("통신판매번호"))
      .filter(line => !line.includes("fortun.unsin.co.kr"));

    const deduped = [];
    const seen = new Set();
    for (const line of lines) {
      const key = line.replace(/\s/g, "");
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(line);
      }
    }

    return deduped.join("\n\n").trim();
  }

  function resultLinesFromText(text) {
    const skip = [
      "어제의 운세",
      "달력 보기",
      "내일의 운세",
      "업체명",
      "서비스URL",
      "대표이사",
      "주소",
      "결제문의",
      "대표전화",
      "담당자 이메일",
      "사업자번호",
      "출원번호",
      "통신판매번호",
      "Copyright"
    ];

    return String(text || "")
      .split(/\n+/)
      .map(normalizeText)
      .filter(Boolean)
      .filter((line) => line.length > 1)
      .filter((line) => !skip.some((word) => line.includes(word)))
      .filter((line) => !/^(\*|\||회사소개|개인정보처리방침|이용약관)$/.test(line));
  }

  function parseResultSections(text) {
    const titles = ["한마디 운세", "애정운", "소망운", "사업운", "금전운", "오늘 이 방향으로 가보세요"];
    const lines = resultLinesFromText(text);
    const pointMatch = lines.join("\n").match(/(\d{1,3})\s*%/);
    const sections = [];
    let current = null;

    for (const line of lines) {
      if (/^\d{1,3}\s*%$/.test(line) || line === "%") continue;

      const title = titles.find((name) => line === name || line.startsWith(`${name} `));
      if (title) {
        current = { title, body: [] };
        sections.push(current);
        const rest = normalizeText(line.slice(title.length));
        if (rest) current.body.push(rest);
        continue;
      }

      if (current) current.body.push(line);
    }

    return {
      point: pointMatch ? `${Math.min(Number(pointMatch[1]), 100)}%` : "",
      sections: sections
        .map((section) => ({
          title: section.title,
          body: section.body.filter(Boolean)
        }))
        .filter((section) => section.body.length)
    };
  }

  function extractResultData() {
    const text = extractResultText();
    return {
      text: resultLinesFromText(text).join("\n\n"),
      ...parseResultSections(text)
    };
  }

  function likelyResultPage() {
    const text = visibleText(document.body);
    const hasResultWords = RESULT_KEYWORDS.filter(k => text.includes(k)).length >= 2;
    const stillForm = hasInputFormControls();

    if (stillForm) return false;

    // URLが /form のままでも、入力欄が消えて結果本文が出ていれば結果ページ扱いにする。
    return hasResultWords && text.includes("오늘의 운세") && text.length > 250;
  }

  async function waitForResultAfterSubmit() {
    // 同一URL・同一DOM内で結果に切り替わるケース対策。
    // 通常のページ遷移なら、新しいページで content.js が再実行される。
    for (let i = 0; i < 24; i++) {
      await sleep(700);
      if (likelyResultPage()) {
        console.info(LOG_PREFIX, "결과 화면을 감지했습니다. 확장 프로그램 페이지로 전환합니다.");
        await handleResult();
        return true;
      }
    }
    console.warn(LOG_PREFIX, "결과 화면을 감지하지 못했습니다. unsin 결과 페이지에 머무를 수 있습니다.");
    return false;
  }

async function handleForm() {
    const response = await chrome.runtime.sendMessage({ type: "GET_PROFILE_AND_STATE" });
    if (!response || !response.ok || !response.profile) return;

    const { pendingAutoRun, profile, settings } = response;
    if (!pendingAutoRun) return;

    console.info(LOG_PREFIX, "폼 자동 입력을 시작합니다.");
    const filled = await fillForm(profile, pendingAutoRun);
    console.info(LOG_PREFIX, "입력 상태", filled);

    if (settings && settings.autoSubmit) {
      await sleep(500);
      const submitted = clickSubmit();
      console.info(LOG_PREFIX, "결과보기 실행", submitted);

      if (submitted) {
        await waitForResultAfterSubmit();
      }
    }
  }

  async function handleResult() {
    // 結果ページの描画が少し遅れるケース対策
    for (let i = 0; i < 5; i++) {
      await sleep(500);
      const data = extractResultData();
      if (data.text && data.text.length >= 80) {
        const title = normalizeText(document.title || "오늘의 운세");
        await chrome.runtime.sendMessage({
          type: "RESULT_EXTRACTED",
          payload: {
            title,
            sourceUrl: location.href,
            extractedAt: new Date().toISOString(),
            ...data
          }
        });
        return;
      }
    }

    console.warn(LOG_PREFIX, "결과 추출에 실패했거나 결과가 너무 짧습니다.");
  }

  async function main() {
    try {
      // 先に結果画面かどうかを見る。
      // unsin側が /form URL のまま結果を返す場合、URL優先だと誤判定するため。
      if (likelyResultPage()) {
        await handleResult();
        return;
      }

      if (isFormPage()) {
        await handleForm();
        return;
      }
    } catch (error) {
      console.error(LOG_PREFIX, error);
    }
  }

  main();
})();
