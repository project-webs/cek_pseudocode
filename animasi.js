(function () {
  const LABELS = ["1. Cek Pseudocode", "2. Cek Golang", "3. Contoh Pseudocode", "4. Contoh Golang"];
  const raw = localStorage.getItem("ck_anim_tab");
  const tab = raw === null ? 0 : Number(raw) || 0;
  const code = localStorage.getItem("ck_anim_code_" + tab) || "";
  const isGo = tab === 1 || tab === 3;
  const lines = code.split("\n");

  document.getElementById("src-label").textContent = LABELS[tab] + (isGo ? " (Go)" : " (Pseudocode)");

  const codeEl = document.getElementById("code");
  lines.forEach((text, i) => {
    const d = document.createElement("div");
    d.textContent = text || " ";
    d.dataset.line = i + 1;
    codeEl.appendChild(d);
  });

  function expr(e, vars) {
    e = e.trim()
      .replace(/≥/g, ">=").replace(/≤/g, "<=").replace(/≠|<>/g, "!=")
      .replace(/([\w.]+)\s+div\s+([\w.]+)/gi, "Math.trunc($1/$2)")
      .replace(/\bmod\b/gi, "%")
      .replace(/\bdan\b/gi, "&&").replace(/\batau\b/gi, "||")
      .replace(/\bbenar\b/gi, "true").replace(/\bsalah\b/gi, "false")
      .replace(/\bpanjang\s*\(/gi, "String(");
    try {
      const names = Object.keys(vars);
      const vals = names.map((n) => vars[n]);
      return Function(...names, "return (" + e + ")")(...vals);
    } catch (err) { return e; }
  }

  function tokenize(line) {
    return line.replace(/\/\/.*$/, "").trim();
  }

  function buildTrace() {
    const vars = {};
    const out = [];
    const steps = [];
    let inputIdx = 0;
    const inputs = (document.getElementById("input").value || "").split(/[\s,;]+/).filter(Boolean);
    const snap = (no, msg) => steps.push({ line: no, vars: { ...vars }, out: out.join("\n"), msg });
    const setv = (n, v) => { vars[n] = v; };
    const next = () => inputs[inputIdx++];

    if (!isGo) {
      let decl = false, inSwitch = false, caseVal = null, switchVal = null, matched = false;
      for (let i = 0; i < lines.length; i++) {
        const s = tokenize(lines[i]), no = i + 1;
        if (!s) continue;
        if (/^(algoritma|mulai|begin)\b/i.test(s)) { decl = false; snap(no, "Mulai algoritma"); continue; }
        if (/^(kamus|deklarasi|declare|var)\s*$/i.test(s)) { decl = true; continue; }
        if (/^program\b/i.test(s) || /^(endprogram|selesai|end|stop)\b/i.test(s)) { snap(no, s); continue; }
        if (decl) {
          if (/^(.+?)\s*:\s*(.+)$/.test(s)) {
            const m = s.match(/^(.+?)\s*:\s*(.+)$/);
            m[1].split(",").map((x) => x.trim()).forEach((n) => setv(n, 0));
            snap(no, "Deklarasi " + m[1]);
          }
          continue;
        }
        let m;
        if ((m = s.match(/^(?:input|baca|read)\b\s*(.+)$/i))) {
          m[1].replace(/[()]/g, "").split(",").forEach((n) => setv(n.trim(), Number(next())));
          snap(no, "Input: " + m[1]); continue;
        }
        if ((m = s.match(/^(?:output|cetak|tampilkan|print|display|tulis)\b\s*(.+)$/i))) {
          const args = m[1].split(",").map((a) => expr(a.replace(/^\(|\)$/g, ""), vars));
          out.push(args.join(" ")); snap(no, "Output: " + args.join(" ")); continue;
        }
        if ((m = s.match(/^([A-Za-z_]\w*)\s*(?:<-|←|:=|=)\s*(.+)$/))) {
          setv(m[1], expr(m[2], vars)); snap(no, m[1] + " = " + vars[m[1]]); continue;
        }
        if ((m = s.match(/^(?:if|jika)\s+(.+?)\s+(?:then|maka)$/i))) {
          const ok = !!expr(m[1], vars); snap(no, "Jika " + m[1] + " → " + (ok ? "benar" : "salah")); continue;
        }
        if ((m = s.match(/^(?:while|selama)\s+(.+?)\s+(?:do|lakukan)$/i))) {
          snap(no, "Selama " + m[1] + " → " + (!!expr(m[1], vars) ? "benar" : "salah")); continue;
        }
        if ((m = s.match(/^(?:for|untuk)\s+(\w+)\s*(?:<-|←|:=|=)\s*(.+?)\s+(?:to|sampai)\s+(.+?)\s+(?:do|lakukan)$/i))) {
          const name = m[1], from = Number(expr(m[2], vars)), to = Number(expr(m[3], vars));
          let end = i + 1, d = 1;
          while (end < lines.length && d > 0) {
            const t = tokenize(lines[end]);
            d += (t.match(/^(if|jika|while|selama|for|untuk|switch|pilih|repeat|ulangi)\b/i) || []).length;
            d -= /^(endif|akhir\s*jika|endwhile|akhir\s*selama|endfor|akhir\s*untuk|endswitch|until|sampai)\b/i.test(t) ? 1 : 0;
            end++;
          }
          setv(name, from); snap(no, name + " = " + from);
          for (let v = from; v <= to; v++) {
            setv(name, v); snap(no, name + " = " + v + " (iterasi)");
            for (let k = i + 1; k < end - 1; k++) {
              const body = tokenize(lines[k]); if (!body) continue;
              let bm;
              if ((bm = body.match(/^(?:output|cetak|tampilkan|print|display|tulis)\b\s*(.+)$/i))) {
                const args = bm[1].split(",").map((a) => expr(a.replace(/^\(|\)$/g, ""), vars));
                out.push(args.join(" ")); snap(k + 1, "Output: " + args.join(" "));
              } else if ((bm = body.match(/^([A-Za-z_]\w*)\s*(?:<-|←|:=|=)\s*(.+)$/))) {
                setv(bm[1], expr(bm[2], vars)); snap(k + 1, bm[1] + " = " + vars[bm[1]]);
              }
            }
          }
          i = end - 1; continue;
        }
        if (/^(endwhile|akhir\s*selama|endfor|akhir\s*untuk|endif|akhir\s*jika|endif)$/i.test(s)) { snap(no, s); continue; }
        if (/^(repeat|ulangi)\s*$/i.test(s)) { snap(no, "Ulangi"); continue; }
        if ((m = s.match(/^(?:until|sampai)\s+(.+)$/i))) { snap(no, "Sampai " + m[1]); continue; }
        if ((m = s.match(/^(?:switch|pilih)\b\s*(?:\(\s*(.+?)\s*\)|(.+))$/i))) { const v = m[1] || m[2]; switchVal = expr(v, vars); matched = false; snap(no, "Switch " + v); continue; }
        if (inSwitch && (m = s.match(/^(?:case|kasus)\s+(.+?)\s*:?\s*$/i))) { caseVal = expr(m[1], vars); matched = matched || switchVal === caseVal; snap(no, "Case " + m[1]); continue; }
        if (inSwitch && /^(?:default|otherwise|lainnya)\s*:?\s*$/i.test(s)) { snap(no, "Default"); continue; }
        if (/^endswitch\b/i.test(s)) { inSwitch = false; snap(no, "Akhir switch"); continue; }
        snap(no, s);
      }
    } else {
      let depth = 0;
      for (let i = 0; i < lines.length; i++) {
        const s = tokenize(lines[i]), no = i + 1;
        if (!s) continue;
        let m;
        if ((m = s.match(/^var\s+(.+)$/))) {
          m[1].split(",").forEach((n) => setv(n.trim().replace(/\s+.*$/, ""), 0));
          snap(no, "Deklarasi " + m[1]); continue;
        }
        if ((m = s.match(/^fmt\.(Scan|Scanln)\s*\((.*)\)$/))) {
          m[2].replace(/[()]/g, "").split(",").forEach((a) => setv(a.replace(/^&/, "").trim(), Number(next())));
          snap(no, "Scan输入: " + m[2]); continue;
        }
        if ((m = s.match(/^fmt\.(Println|Print)\s*\((.*)\)$/))) {
          const args = m[2].split(",").map((a) => {
            const v = a.trim().replace(/^\(|\)$/g, "").replace(/^"|"$/g, "").replace(/^'|'$/g, "");
            return expr(v, vars);
          });
          out.push(args.join(" ")); snap(no, "Output: " + args.join(" ")); continue;
        }
        if ((m = s.match(/^([A-Za-z_]\w*)\s*(?::=|=)\s*(.+)$/))) {
          setv(m[1], expr(m[2].replace(/;$/, ""), vars)); snap(no, m[1] + " = " + vars[m[1]]); continue;
        }
        if ((m = s.match(/^([A-Za-z_]\w*)\s*(\+\+|--)$/))) {
          setv(m[1], m[2] === "++" ? Number(vars[m[1]]) + 1 : Number(vars[m[1]]) - 1);
          snap(no, m[1] + m[2] + " → " + vars[m[1]]); continue;
        }
        if ((m = s.match(/^if\s+(.+?)\s*\{$/))) { snap(no, "If " + m[1]); continue; }
        if ((m = s.match(/^for\s+(.+?)\s*\{$/))) { snap(no, "For " + m[1]); continue; }
        if (/^}/.test(s)) { snap(no, "Akur kurung"); continue; }
        snap(no, s);
      }
    }
    return steps;
  }

  let steps = [];
  let cursor = 0;
  let timer = null;

  function render() {
    const s = steps[cursor] || { line: 1, vars: {}, out: "", msg: "-" };
    Array.from(codeEl.children).forEach((el) => {
      el.className = Number(el.dataset.line) === s.line ? "active" : "";
    });
    const varsEl = document.getElementById("vars");
    varsEl.innerHTML = "";
    Object.keys(s.vars).forEach((k) => {
      const d = document.createElement("div");
      d.className = "chip";
      d.textContent = k + " = " + s.vars[k];
      varsEl.appendChild(d);
    });
    document.getElementById("output").textContent = s.out || "-";
    document.getElementById("detail").textContent = s.msg || "-";
    document.getElementById("info").textContent = "Langkah " + (cursor + 1) + " / " + steps.length;
    const active = codeEl.querySelector(".active");
    if (active) active.scrollIntoView({ block: "nearest" });
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    document.getElementById("play").textContent = "▶ Putar";
    document.getElementById("play").classList.remove("on");
  }

  function run() {
    try { steps = buildTrace(); cursor = 0; render(); }
    catch (e) {
      steps = [{ line: 1, vars: {}, out: "", msg: "Error: " + e.message }];
      cursor = 0; render();
    }
  }

  document.getElementById("run").onclick = () => { stop(); run(); };
  document.getElementById("play").onclick = () => {
    if (timer) { stop(); return; }
    if (cursor >= steps.length - 1) cursor = 0;
    document.getElementById("play").textContent = "⏸ Jeda";
    document.getElementById("play").classList.add("on");
    timer = setInterval(() => {
      if (cursor >= steps.length - 1) { stop(); return; }
      cursor++; render();
    }, 600);
  };
  document.getElementById("prev").onclick = () => { stop(); cursor = Math.max(0, cursor - 1); render(); };
  document.getElementById("next").onclick = () => { stop(); cursor = Math.min(steps.length - 1, cursor + 1); render(); };
  document.getElementById("back").onclick = () => { location.href = "index.html"; };

  run();
})();
