// Generates docs/progress/progress-dashboard.html from the tracked sources.
// Run: npm run progress:dashboard   (or: node scripts/progress-dashboard.mjs)
//
// Sources of truth:
//   - docs/progress/status.json                                  (phase states)
//   - docs/progress/launch-checklist.md                          (19 launch items)
//   - docs/progress/evidence-r6-run10/results/b3-core-suite-summary.txt   (wave 1 final)
//   - docs/progress/evidence-r6-run10/results/b3-wave2-summary.txt        (wave 2, last run per spec)
//   - git log (last 5 commits)
// Product-fix counts are declared constants below; update them with the evidence files when they change.

import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ── Declared constants (update alongside the evidence reports) ───────────────
const BLOCKED_EXTERNAL = ["owner-portal-online-payment-fawry", "fawry-production-foundation", "payment-provider-settings", "tax-mapping-review", "reports-unbuilt-sections", "release-a-production-gate"];
const PRODUCT_FIXES = { verified: 3, copyRestored: 4 }; // responsive-overflow, chart-gates, tenant-permissions (invite); dunning banner, rates copy, statement-forms leak, runtime wording
const TRIAGE_REMAINING = { rewrites: 3, environment: 0 }; // einvoice-settings (feature not exposed), owner-portal-invite (passwordless flow), new-finance-screens-smoke (dialog controls)

// ── status.json ──────────────────────────────────────────────────────────────
const status = JSON.parse(read("docs/progress/status.json"));
const phases = status.phases;
const verified = phases.filter((p) => p.status === "verified").length;
const codeComplete = phases.filter((p) => p.status === "code_complete").length;
const notStarted = phases.filter((p) => p.status === "not_started").length;
const phasePct = Math.round((verified / phases.length) * 100);
const phaseChip = { verified: ["g", "verified"], code_complete: ["b", "code_complete"], not_started: ["r", "not_started"] };
const phaseRows = phases.map((p) =>
  `<tr><td>${esc(p.name_ar)}</td><td><span class="chip ${phaseChip[p.status]?.[0] ?? "b"}">${p.status}</span></td><td><code>docs/progress/status.json</code></td></tr>`
).join("\n");

// ── launch checklist ─────────────────────────────────────────────────────────
const checklist = read("docs/progress/launch-checklist.md");
const items = [...checklist.matchAll(/^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*(✅|⚠️|❌)[^|]*\|/gm)]
  .map((m) => ({ n: Number(m[1]), title: m[2].replace(/`/g, "").trim(), state: m[3] }));
if (items.length !== 19) throw new Error(`launch-checklist: expected 19 items, parsed ${items.length}`);
const done = items.filter((i) => i.state === "✅").length;
const partial = items.filter((i) => i.state === "⚠️").length;
const open = items.filter((i) => i.state === "❌").length;
const gatePct = Math.round((done / items.length) * 100);
const GATES = [
  ["البوابة 1 · قرارات خارجية", 1, 3],
  ["البوابة 2 · اكتمال النطاق", 4, 7],
  ["البوابة 3 · جاهزية الإنتاج", 8, 10],
  ["البوابة 4 · بيئة الإنتاج", 11, 16],
  ["البوابة 5 · تسويق بصدق", 17, 19],
];
const chipFor = (s) => (s === "✅" ? "g" : s === "⚠️" ? "a" : "r");
const gateCards = GATES.map(([label, from, to]) => {
  const inGate = items.filter((i) => i.n >= from && i.n <= to);
  const ok = inGate.filter((i) => i.state === "✅").length;
  const list = inGate.map((i) => `<li>${esc(i.title)} <span class="chip ${chipFor(i.state)}">${i.state}</span></li>`).join("\n");
  return `<div class="card">
      <div class="row" style="display:flex;justify-content:space-between"><b>${label}</b><span class="chip ${ok === inGate.length ? "g" : ok ? "a" : "r"}">${ok}/${inGate.length}</span></div>
      <ul class="clean">${list}</ul>
    </div>`;
}).join("\n");

// ── e2e suites ───────────────────────────────────────────────────────────────
function parseSuite(file) {
  const map = new Map();
  for (const line of read(file).split(/\r?\n/)) {
    const m = line.match(/^(\S+) -> exit=(\d+)(.*)$/);
    if (m) map.set(m[1], { exit: Number(m[2]), rest: m[3].trim() });
  }
  const entries = [...map.values()];
  const green = entries.filter((e) => e.exit === 0).length;
  const passed = entries.reduce((sum, e) => {
    const p = e.rest.match(/(\d+) passed/);
    return sum + (p ? Number(p[1]) : 0);
  }, 0);
  return { total: entries.length, green, passed };
}
const core = parseSuite("docs/progress/evidence-r6-run10/results/b3-core-suite-summary.txt");
const wave2 = parseSuite("docs/progress/evidence-r6-run10/results/b3-wave2-summary.txt");
const runnableTotal = core.total + wave2.total;
const runnableGreen = core.green + wave2.green;
const uiPct = Math.round((runnableGreen / runnableTotal) * 100);

// ── commits ──────────────────────────────────────────────────────────────────
const commits = execFileSync("git", ["log", "-5", "--pretty=format:%h|%s"], { cwd: ROOT, encoding: "utf8" })
  .split("\n")
  .filter(Boolean)
  .map((l) => l.split("|"));
const commitRows = commits.map(([hash, subject]) => `<tr><td><code>${esc(hash)}</code></td><td>${esc(subject)}</td></tr>`).join("\n");

const generatedAt = new Date().toISOString().slice(0, 16).replace("T", " ");

const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AqarBooks — لوحة تقدم المشروع</title>
<style>
  :root{
    --bg:#f6f8fa; --card:#ffffff; --ink:#0f172a; --muted:#64748b; --line:#e2e8f0;
    --green:#059669; --green-bg:#ecfdf5; --amber:#d97706; --amber-bg:#fffbeb;
    --red:#dc2626; --red-bg:#fef2f2; --blue:#2563eb; --blue-bg:#eff6ff;
    --teal:#07425d; --radius:18px;
  }
  *{box-sizing:border-box}
  body{margin:0;background:
      radial-gradient(1200px 500px at 85% -10%, #dbeafe66, transparent),
      radial-gradient(900px 400px at 10% 0%, #d1fae566, transparent), var(--bg);
    color:var(--ink);font-family:"Segoe UI",Tahoma,"Noto Naskh Arabic",system-ui,sans-serif;line-height:1.6}
  .wrap{max-width:1120px;margin:0 auto;padding:32px 20px 64px}
  header.hero{background:linear-gradient(135deg,#07425d,#0e7490 55%,#0d9488);color:#fff;
    border-radius:26px;padding:34px 34px 30px;box-shadow:0 18px 44px -18px #07425d99;position:relative;overflow:hidden}
  header.hero::after{content:"";position:absolute;inset:auto -80px -120px auto;width:360px;height:360px;
    background:radial-gradient(circle,#ffffff22,transparent 65%);border-radius:50%}
  h1{margin:0 0 6px;font-size:26px;letter-spacing:-.3px}
  .sub{opacity:.85;font-size:13px}
  .badge{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:4px 12px;font-size:12px;font-weight:700}
  .badge.green{background:var(--green-bg);color:var(--green)}
  .badge.amber{background:var(--amber-bg);color:var(--amber)}
  .badge.red{background:var(--red-bg);color:var(--red)}
  .badge.blue{background:var(--blue-bg);color:var(--blue)}
  .badge.onDark{background:#ffffff22;color:#fff}
  .grid{display:grid;gap:18px}
  .rings{grid-template-columns:repeat(auto-fit,minmax(220px,1fr));margin-top:26px}
  .card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);
    padding:22px;box-shadow:0 1px 2px #0f172a08,0 10px 26px -18px #0f172a33}
  .ring-wrap{display:flex;gap:16px;align-items:center}
  .ring{--p:0;width:96px;height:96px;border-radius:50%;flex:0 0 auto;
    background:conic-gradient(var(--ringColor) calc(var(--p)*1%), #e5e7eb 0);display:grid;place-items:center}
  .ring > div{width:74px;height:74px;border-radius:50%;background:#fff;display:grid;place-items:center;
    font-weight:800;font-size:18px;color:var(--ink)}
  .ring small{display:block;font-size:10px;font-weight:600;color:var(--muted)}
  .ring-label b{display:block;font-size:15px}
  .ring-label span{font-size:12px;color:var(--muted)}
  .dash{display:flex;gap:8px;align-items:center;margin-top:6px;font-size:12px;color:var(--muted)}
  .bar{height:10px;border-radius:999px;background:#e5e7eb;overflow:hidden;margin:8px 0 4px}
  .bar > i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#0d9488,#2563eb);
    animation:grow 1.1s cubic-bezier(.2,.7,.3,1) both}
  .bar.green > i{background:linear-gradient(90deg,#10b981,#059669)}
  .bar.amber > i{background:linear-gradient(90deg,#f59e0b,#d97706)}
  .bar.red > i{background:linear-gradient(90deg,#f87171,#dc2626)}
  @keyframes grow{from{width:0!important}to{}}
  h2{font-size:18px;margin:34px 0 14px;display:flex;align-items:center;gap:10px}
  h2::before{content:"";width:6px;height:22px;border-radius:4px;background:linear-gradient(#0d9488,#2563eb)}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th,td{padding:10px 12px;text-align:start;border-bottom:1px solid var(--line);vertical-align:top}
  th{font-size:11px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.4px}
  tr:last-child td{border-bottom:none}
  .rows .row{display:flex;justify-content:space-between;gap:14px;align-items:center;padding:10px 0;border-bottom:1px dashed var(--line)}
  .rows .row:last-child{border-bottom:none}
  .chip{font-size:11px;font-weight:800;border-radius:999px;padding:2px 10px;white-space:nowrap}
  .chip.g{background:var(--green-bg);color:var(--green)} .chip.a{background:var(--amber-bg);color:var(--amber)}
  .chip.r{background:var(--red-bg);color:var(--red)} .chip.b{background:var(--blue-bg);color:var(--blue)}
  .two{grid-template-columns:repeat(auto-fit,minmax(340px,1fr))}
  ul.clean{margin:6px 0 0;padding-inline-start:18px;font-size:13px;color:#334155}
  ul.clean li{margin:6px 0}
  code{background:#f1f5f9;border:1px solid var(--line);border-radius:6px;padding:1px 6px;font-size:11px;direction:ltr;display:inline-block}
  footer{margin-top:36px;font-size:11px;color:var(--muted);text-align:center}
  .legend{display:flex;gap:14px;flex-wrap:wrap;font-size:11px;color:#cfe3ea;margin-top:10px}
  .dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-inline-end:5px}
</style>
</head>
<body>
<div class="wrap">

  <header class="hero">
    <div style="display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;align-items:flex-start">
      <div>
        <h1>AqarBooks — لوحة تقدم المشروع</h1>
        <div class="sub">إقفال السنة المالية · جودة الواجهة · جاهزية الإطلاق — حالة موثقة بالأدلة، محليًا على r6 فقط</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <span class="badge onDark">آخر تحديث: ${generatedAt}</span>
        <span class="badge onDark">لا نشر · لا push</span>
      </div>
    </div>

    <div class="grid rings">
      <div class="card">
        <div class="ring-wrap">
          <div class="ring" style="--p:${phasePct};--ringColor:#0d9488"><div>${phasePct}%<small>verified</small></div></div>
          <div class="ring-label">
            <b>مراحل المشروع</b>
            <span>${verified} verified · ${codeComplete} code_complete · ${notStarted} not_started</span>
            <div class="dash">الدفعات المالية المقبولة على r6: 1B، 2، 3، BI-1</div>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="ring-wrap">
          <div class="ring" style="--p:${uiPct};--ringColor:#2563eb"><div>${uiPct}%<small>أخضر</small></div></div>
          <div class="ring-label">
            <b>الواجهة القابلة للتشغيل</b>
            <span>${runnableGreen} من ${runnableTotal} spec خضراء (${core.green} نواة + ${wave2.green} موجة ثانية)</span>
            <div class="dash">${BLOCKED_EXTERNAL.length} محجوبة خارجيًا · ${TRIAGE_REMAINING.rewrites + TRIAGE_REMAINING.environment} قيد المعالجة</div>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="ring-wrap">
          <div class="ring" style="--p:${gatePct};--ringColor:#d97706"><div>${done}/${items.length}<small>مكتمل</small></div></div>
          <div class="ring-label">
            <b>بوابة الإطلاق</b>
            <span>${done} ✅ · ${partial} ⚠️ جزئي · ${open} ❌</span>
            <div class="dash">الإنتاج غير متصل · الجاهزية غير مقيّمة</div>
          </div>
        </div>
      </div>
    </div>
    <div class="legend">
      <span><i class="dot" style="background:#059669"></i>مكتمل بتقديم دليل</span>
      <span><i class="dot" style="background:#d97706"></i>جزئي / قيد العمل</span>
      <span><i class="dot" style="background:#dc2626"></i>غير منجز</span>
      <span><i class="dot" style="background:#94a3b8"></i>محجوب خارجيًا</span>
    </div>
  </header>

  <h2>المراحل</h2>
  <div class="card">
    <table>
      <thead><tr><th>المرحلة</th><th>الحالة</th><th>المصدر</th></tr></thead>
      <tbody>${phaseRows}</tbody>
    </table>
  </div>

  <h2>جودة الواجهة (E2E على r6)</h2>
  <div class="grid two">
    <div class="card">
      <div class="row" style="display:flex;justify-content:space-between"><b>الموجة 1 — النواة المالية</b><span class="chip ${core.green === core.total ? "g" : "a"}">${core.green}/${core.total}</span></div>
      <div class="bar ${core.green === core.total ? "green" : "amber"}"><i style="width:${Math.round((core.green / core.total) * 100)}%"></i></div>
      <div class="dash">${core.passed} اختبارًا · أُعيد تشغيل الست المتعثرة بعد الإصلاحات</div>
    </div>
    <div class="card">
      <div class="row" style="display:flex;justify-content:space-between"><b>الموجة 2 — الباقي القابل للتشغيل</b><span class="chip ${wave2.green === wave2.total ? "g" : "a"}">${wave2.green}/${wave2.total}</span></div>
      <div class="bar ${wave2.green === wave2.total ? "green" : "amber"}"><i style="width:${Math.round((wave2.green / wave2.total) * 100)}%"></i></div>
      <div class="dash">${TRIAGE_REMAINING.rewrites} تحتاج إعادة كتابة spec · ${TRIAGE_REMAINING.environment} بيئة/fixture</div>
    </div>
    <div class="card">
      <div class="row" style="display:flex;justify-content:space-between"><b>المحجوبة خارجيًا</b><span class="chip b">${BLOCKED_EXTERNAL.length}</span></div>
      <div class="bar"><i style="width:0;background:#94a3b8"></i></div>
      <div class="dash">${BLOCKED_EXTERNAL.map((s) => `<span dir="ltr">${esc(s)}</span>`).join(" · ")}</div>
    </div>
    <div class="card">
      <div class="row" style="display:flex;justify-content:space-between"><b>الإصلاحات المنتجية المثبتة</b><span class="chip g">${PRODUCT_FIXES.verified} + ${PRODUCT_FIXES.copyRestored}</span></div>
      <div class="bar green"><i style="width:100%"></i></div>
      <div class="dash">responsive-overflow (18/18) · chart-gates (4/4) · بانر dunning · شرح rates</div>
    </div>
  </div>

  <h2>بوابة الإطلاق — ${items.length} بندًا</h2>
  <div class="grid two">
${gateCards}
  </div>

  <h2>الالتزامات الأخيرة</h2>
  <div class="card">
    <table>
      <thead><tr><th>الالتزام</th><th>المحتوى</th></tr></thead>
      <tbody>${commitRows}</tbody>
    </table>
  </div>

  <footer>
    مولّد آليًا من <code>docs/progress/status.json</code> · <code>launch-checklist.md</code> · ملخصات الأدلة · git log — محلي على r6 فقط، وليس تقييم جاهزية إنتاج.
  </footer>
</div>
</body>
</html>
`;

writeFileSync(join(ROOT, "docs/progress/progress-dashboard.html"), html);
console.log(`progress-dashboard.html written — phases ${verified}/${phases.length} verified, UI ${runnableGreen}/${runnableTotal}, launch ${done}/${items.length}`);
