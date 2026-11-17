// Build script for scoopmaendeleo.com
// Reads content/news/*.md, then writes the full site to dist/:
//   - copies the static site (index.html, en/, img/, assets/, admin/…)
//   - injects the News dropdown, homepage block and footer link into both homepages
//   - generates /actualites/ and /en/news/ listing pages, one page per article,
//     RSS feeds, sitemap.xml, robots.txt and a 404 page
// Run locally with:  npm install && npm run build   (Cloudflare Pages runs the same)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { marked } from "marked";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const SITE = "https://www.scoopmaendeleo.com";
const TODAY = new Date().toISOString().slice(0, 10);
const COPY = ["index.html", "en", "img", "assets", "admin", "docs", "_headers"];

let sharp = null;
try { sharp = (await import("sharp")).default; } catch { console.warn("sharp not available: news images will not be converted to WebP"); }

/* ---------- helpers ---------- */
const esc = (s = "") => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const write = (rel, data) => { const p = path.join(DIST, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data); };
const stripMd = (md = "") => md.replace(/!\[[^\]]*]\([^)]*\)/g, "").replace(/\[([^\]]*)]\([^)]*\)/g, "$1").replace(/[#*_>`~-]/g, "").replace(/\s+/g, " ").trim();
const clip = (s, n = 158) => (s.length <= n ? s : s.slice(0, s.lastIndexOf(" ", n - 1)) + "…");
const slugify = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const CATS = {
  event: ["Événement", "Event"], activity: ["Activité", "Activity"], training: ["Formation", "Training"],
  harvest: ["Récolte", "Harvest"], export: ["Export", "Export"], partnership: ["Partenariat", "Partnership"], community: ["Communauté", "Community"],
};
const T = {
  fr: { news: "Actualités", all: "Toutes les actualités", home: "Accueil", latest: "La vie de la coopérative", lead: "Événements, récoltes, formations et expéditions : suivez les activités de la Société Coopérative Agricole Maendeleo.",
        read: "Lire l'article", allCats: "Toutes", min: "min de lecture", share: "Partager", copy: "Copier le lien", copied: "Lien copié ✓", more: "Autres actualités",
        frOnly: "", enOnly: "", none: "Aucune actualité pour le moment.", back: "Retour à l'accueil", notFound: "Page introuvable", notFoundT: "Cette page n'existe pas ou a été déplacée.",
        base: "/", newsBase: "/actualites/", lots: "Voir les lots" },
  en: { news: "News", all: "All news", home: "Home", latest: "Life at the cooperative", lead: "Events, harvests, training and shipments: follow the activities of the Maendeleo Agricultural Cooperative Society.",
        read: "Read article", allCats: "All", min: "min read", share: "Share", copy: "Copy link", copied: "Link copied ✓", more: "More news",
        frOnly: "In French", enOnly: "", none: "No news yet.", back: "Back to home", notFound: "Page not found", notFoundT: "This page does not exist or has moved.",
        base: "/en/", newsBase: "/en/news/", lots: "View lots" },
};
const fmtDate = (d, lang, style = "long") => new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB",
  style === "long" ? { day: "numeric", month: "long", year: "numeric" } : { day: "numeric", month: "short", year: "numeric" }).format(d);

/* ---------- 1. fresh dist + static copy ---------- */
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
for (const item of COPY) {
  const src = path.join(ROOT, item);
  if (fs.existsSync(src)) fs.cpSync(src, path.join(DIST, item), { recursive: true });
}

/* ---------- 2. read posts ---------- */
const NEWS_DIR = path.join(ROOT, "content", "news");
const files = fs.existsSync(NEWS_DIR) ? fs.readdirSync(NEWS_DIR).filter((f) => f.endsWith(".md")) : [];
const posts = [];
for (const file of files) {
  const raw = fs.readFileSync(path.join(NEWS_DIR, file), "utf8").replace(/^﻿/, "");
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!m) { console.warn(`Skipped ${file}: no front matter`); continue; }
  let fm;
  try { fm = yaml.load(m[1]) || {}; } catch (e) { console.warn(`Skipped ${file}: ${e.message}`); continue; }
  if (fm.draft === true) continue;
  if (!fm.title) { console.warn(`Skipped ${file}: missing title`); continue; }
  const date = fm.date instanceof Date ? fm.date : new Date(String(fm.date || file.slice(0, 10)));
  if (isNaN(date)) { console.warn(`Skipped ${file}: bad date`); continue; }
  const slug = slugify(file.replace(/\.md$/, "").replace(/^\d{4}-\d{2}-\d{2}-/, "")) || slugify(fm.title);
  const body = (m[2] || "").trim();
  const bodyEn = (fm.body_en || "").trim();
  const hasEn = !!(fm.title_en && bodyEn);
  posts.push({
    file, slug, date, iso: date.toISOString().slice(0, 10),
    cat: CATS[fm.category] ? fm.category : "activity",
    image: fm.image || "", imageAlt: fm.image_alt || fm.title,
    fr: { title: fm.title, excerpt: clip(fm.excerpt || stripMd(body)), html: marked.parse(body), words: stripMd(body).split(" ").length },
    en: hasEn ? { title: fm.title_en, excerpt: clip(fm.excerpt_en || stripMd(bodyEn)), html: marked.parse(bodyEn), words: stripMd(bodyEn).split(" ").length } : null,
  });
}
posts.sort((a, b) => b.date - a.date || a.slug.localeCompare(b.slug));
const seen = new Set();
for (const p of posts) { while (seen.has(p.slug)) p.slug += "-2"; seen.add(p.slug); }
console.log(`${posts.length} published post(s)`);

/* ---------- 3. images → WebP 800/1600 ---------- */
const DEFAULT_IMG = { src: "/img/og-scoop-maendeleo-cafe-kivu.jpg", srcset: "", w: 1200, h: 630, og: "/img/og-scoop-maendeleo-cafe-kivu.jpg" };
for (const p of posts) {
  p.img = { ...DEFAULT_IMG, alt: p.imageAlt };
  if (!p.image) continue;
  const rel = p.image.replace(/^\//, "");
  const src = path.join(ROOT, rel);
  if (!fs.existsSync(src)) { console.warn(`Image not found for ${p.file}: ${p.image}`); continue; }
  p.img = { src: "/" + rel, srcset: "", w: 1600, h: 1000, og: "/" + rel, alt: p.imageAlt };
  if (!sharp) continue;
  try {
    const base = rel.replace(/\.[^.]+$/, "");
    const meta = await sharp(src).rotate().metadata();
    const outs = [];
    for (const w of [800, 1600]) {
      const out = `${base}-${w}.webp`;
      const info = await sharp(src).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: 76 }).toFile(path.join(DIST, out));
      outs.push([out, info.width, info.height]);
    }
    const [, w16, h16] = outs[1];
    p.img = { src: "/" + outs[0][0], srcset: `/${outs[0][0]} 800w, /${outs[1][0]} 1600w`, w: w16, h: h16, og: "/" + rel, alt: p.imageAlt };
    if (meta.width && meta.width > 2400) { // keep the JPG used for social previews reasonably small
      await sharp(src).rotate().resize({ width: 1600 }).jpeg({ quality: 80 }).toFile(path.join(DIST, rel));
    }
  } catch (e) { console.warn(`Image processing failed for ${p.file}: ${e.message}`); }
}

/* per-language view of a post (EN falls back to FR with a badge) */
const view = (p, lang) => {
  const own = lang === "fr" ? p.fr : p.en;
  const c = own || p.fr;
  return {
    ...c, fallback: !own, lang: own ? lang : "fr",
    url: own ? (lang === "fr" ? `/actualites/${p.slug}/` : `/en/news/${p.slug}/`) : `/actualites/${p.slug}/`,
    cat: CATS[p.cat][lang === "fr" ? 0 : 1], catKey: p.cat, date: fmtDate(p.date, lang), dateShort: fmtDate(p.date, lang, "short"), iso: p.iso, img: p.img,
    minutes: Math.max(1, Math.round(c.words / 200)),
  };
};
const imgTag = (img, sizes, extra = "") =>
  `<img src="${esc(img.src)}"${img.srcset ? ` srcset="${img.srcset}" sizes="${sizes}"` : ""} width="${img.w}" height="${img.h}" alt="${esc(img.alt)}"${extra}>`;

/* ---------- 4. shared fragments ---------- */
const chev = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>`;
function dropdown(lang) {
  if (!posts.length) return "";
  const t = T[lang];
  const items = posts.slice(0, 4).map((p) => {
    const v = view(p, lang);
    return `<a href="${v.url}" role="menuitem"><img src="${esc(v.img.src)}" alt="" width="58" height="58" loading="lazy"><span class="t"><small>${esc(v.cat)} · ${v.dateShort}${v.fallback ? " · FR" : ""}</small><b>${esc(v.title)}</b></span></a>`;
  }).join("");
  const fresh = (Date.now() - posts[0].date) / 864e5 < 30 ? `<span class="dot" aria-hidden="true"></span>` : "";
  return `<div class="dd"><button class="dd-btn" type="button" aria-haspopup="true" aria-expanded="false">${fresh}${t.news}${chev}</button>` +
    `<div class="dd-menu" role="menu"><div class="dd-panel">${items}<a class="dd-all" href="${t.newsBase}" role="menuitem">${t.all} →</a></div></div></div>`;
}
function drawerGroup(lang) {
  if (!posts.length) return "";
  const t = T[lang];
  return `<div class="drawer-news"><small>${t.news}</small>` +
    posts.slice(0, 3).map((p) => { const v = view(p, lang); return `<a href="${v.url}">${esc(v.title)}</a>`; }).join("") +
    `<a class="all" href="${t.newsBase}">${t.all} →</a></div>`;
}
function card(p, lang, feature = false) {
  const v = view(p, lang), t = T[lang];
  return `<a class="ncard${feature ? " feature" : ""}" href="${v.url}" data-cat="${v.catKey}"${v.fallback ? ' hreflang="fr"' : ""}>` +
    `<div class="ph">${imgTag(v.img, feature ? "(max-width:1020px) 100vw, 60vw" : "(max-width:640px) 100vw, (max-width:1020px) 50vw, 33vw", ' loading="lazy" decoding="async"')}</div>` +
    `<div class="bd"><div class="meta"><span class="ncat ${v.catKey}">${esc(v.cat)}</span><time class="ndate" datetime="${v.iso}">${v.date}</time>${v.fallback ? `<span class="lang-only">${t.frOnly}</span>` : ""}</div>` +
    `<h3>${esc(v.title)}</h3><p>${esc(v.excerpt)}</p><span class="more">${t.read} →</span></div></a>`;
}
function homeSection(lang) {
  if (!posts.length) return "";
  const t = T[lang];
  return `<section class="news-home" id="news">
  <div class="wrap">
    <div class="news-head"><div><span class="eyebrow">${t.news}</span><h2>${t.latest}.</h2></div><a class="link-arrow" href="${t.newsBase}">${t.all} →</a></div>
    <div class="ngrid">${posts.slice(0, 3).map((p) => card(p, lang)).join("")}</div>
  </div>
</section>
`;
}
const inject = (html, key, content) => html.replace(new RegExp(`<!--${key}-->[\\s\\S]*?<!--/${key}-->`), `<!--${key}-->${content}<!--/${key}-->`);

/* ---------- 5. homepages ---------- */
for (const [lang, file] of [["fr", "index.html"], ["en", "en/index.html"]]) {
  const p = path.join(DIST, file);
  let html = fs.readFileSync(p, "utf8");
  html = inject(html, "NEWS-NAV", dropdown(lang));
  html = inject(html, "NEWS-DRAWER", drawerGroup(lang));
  html = inject(html, "NEWS-SECTION", homeSection(lang));
  html = inject(html, "NEWS-FOOT", posts.length ? `<li><a href="${T[lang].newsBase}">${T[lang].news}</a></li>` : "");
  if (!html.includes("/assets/news.js")) html = html.replace("</body>", `<script src="/assets/news.js" defer></script>\n</body>`);
  fs.writeFileSync(p, html);
}

/* ---------- 6. sub-page shell (nav + footer from the homepage design) ---------- */
const homeFr = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const css = (homeFr.match(/<style>([\s\S]*?)<\/style>/) || [, ""])[1];
write("assets/site.css", css);
const fontLinks = (homeFr.match(/<link rel="preconnect"[\s\S]*?display=swap" rel="stylesheet">/) || [""])[0];

const NAV = {
  fr: [["#about", "La coopérative"], ["#terroir", "Terroir"], ["#eudr", "EUDR"], ["#process", "Processus"], ["#products", "Produits"], ["#lots", "Lots"], ["#impact", "Impact"], ["#gallery", "Galerie"]],
  en: [["#about", "The Cooperative"], ["#terroir", "Terroir"], ["#eudr", "EUDR"], ["#process", "Process"], ["#products", "Products"], ["#lots", "Lots"], ["#impact", "Impact"], ["#gallery", "Gallery"]],
};
function shell(lang, { title, description, canonical, alternates = [], ogImage, ogType = "website", jsonld = [], body, frUrl, enUrl }) {
  const t = T[lang], b = t.base;
  const links = NAV[lang].map(([h, l]) => `<a href="${b}${h}">${l}</a>`).join("\n      ");
  const dlinks = NAV[lang].map(([h, l]) => `<a href="${b}${h}">${l}</a>`).join("\n  ");
  const alt = alternates.map(([hl, u]) => `<link rel="alternate" hreflang="${hl}" href="${SITE}${u}">`).join("\n");
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${SITE}${canonical}">
${alt}
<meta name="robots" content="index,follow,max-image-preview:large">
<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="SCOOP-CA Maendeleo">
<meta property="og:locale" content="${lang === "fr" ? "fr_FR" : "en_US"}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${SITE}${canonical}">
<meta property="og:image" content="${SITE}${ogImage}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#24130f">
<link rel="icon" type="image/png" href="/img/logo-scoop-maendeleo.png">
<link rel="apple-touch-icon" href="/img/apple-touch-icon.png">
<link rel="alternate" type="application/rss+xml" title="RSS" href="${t.newsBase}feed.xml">
${fontLinks}
<link rel="stylesheet" href="/assets/site.css">
<link rel="stylesheet" href="/assets/news.css">
${jsonld.map((j) => `<script type="application/ld+json">${JSON.stringify(j)}</script>`).join("\n")}
</head>
<body class="sub">
<header class="nav" id="nav">
  <div class="wrap">
    <a href="${b}" class="brand" aria-label="Maendeleo"><img src="/img/logo-scoop-maendeleo.png" width="46" height="46" alt="${lang === "fr" ? "Logo de la Société Coopérative Agricole Maendeleo" : "Maendeleo Agricultural Cooperative logo"}"><div>Maendeleo<small>SCOOP-CA · ${lang === "fr" ? "Sud-Kivu" : "South Kivu"}</small></div></a>
    <nav class="links" aria-label="${lang === "fr" ? "Navigation principale" : "Main navigation"}">
      ${links}
      ${dropdown(lang)}
    </nav>
    <div class="lang" role="group" aria-label="Langue / Language">
      <a href="${frUrl}" hreflang="fr" lang="fr" aria-current="${lang === "fr"}"><span>FR</span></a>
      <a href="${enUrl}" hreflang="en" lang="en" aria-current="${lang === "en"}"><span>EN</span></a>
    </div>
    <a href="${b}#lots" class="btn btn-primary">${t.lots}</a>
    <button class="burger" id="burger" aria-label="Menu"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M4 12h16M4 17h10"/></svg></button>
  </div>
</header>
<div class="drawer" id="drawer">
  <button class="close" id="dclose" aria-label="${lang === "fr" ? "Fermer" : "Close"}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
  ${dlinks}
  ${drawerGroup(lang)}
  <a href="${b}#contact">Contact</a>
</div>
<main id="main">
${body}
</main>
<footer>
  <div class="wrap">
    <div class="fgrid">
      <div>
        <a href="${b}" class="brand"><img src="/img/logo-scoop-maendeleo.png" width="46" height="46" alt="" loading="lazy"><div>Maendeleo<small>${lang === "fr" ? "Société Coopérative Agricole" : "Agricultural Cooperative"}</small></div></a>
        <p style="margin-top:1rem;max-width:36ch">${lang === "fr" ? "Production, transformation et exportation de café Arabica de spécialité depuis le Sud-Kivu, RD Congo." : "Growing, processing and exporting specialty Arabica coffee from South Kivu, DR Congo."}</p>
      </div>
      <div><h5>Navigation</h5><ul><li><a href="${b}#about">${NAV[lang][0][1]}</a></li><li><a href="${b}#products">${NAV[lang][4][1]}</a></li><li><a href="${b}#lots">Lots</a></li><li><a href="${t.newsBase}">${t.news}</a></li><li><a href="${b}#faq">FAQ</a></li><li><a href="${b}#contact">Contact</a></li></ul></div>
      <div><h5>${lang === "fr" ? "Informations légales" : "Legal information"}</h5><ul><li>SCOOP-CA Maendeleo</li><li>Id. Nat. 19-H5300-N23413Z</li><li>RCCM CD/GOM/RCCM/23-B00082</li><li>NIF A2306573W</li></ul></div>
    </div>
    <div class="legal"><span>© <span id="yr">${new Date().getFullYear()}</span> SCOOP-CA Maendeleo · Katana, ${lang === "fr" ? "Sud-Kivu" : "South Kivu"}</span><span style="font-family:var(--serif);font-style:italic">${lang === "fr" ? "« Uni pour un Café Compétitif »" : "“United for a Competitive Coffee”"}</span></div>
  </div>
</footer>
<script src="/assets/news.js" defer></script>
</body>
</html>
`;
}

const ORG_REF = { "@type": "Organization", "@id": `${SITE}/#org`, name: "Société Coopérative Agricole Maendeleo", logo: { "@type": "ImageObject", url: `${SITE}/img/logo-scoop-maendeleo.png` } };
const crumbsLd = (items) => ({ "@context": "https://schema.org", "@type": "BreadcrumbList",
  itemListElement: items.map(([name, url], i) => ({ "@type": "ListItem", position: i + 1, name, item: SITE + url })) });

/* ---------- 7. listing pages ---------- */
for (const lang of ["fr", "en"]) {
  const t = T[lang];
  const used = [...new Set(posts.map((p) => p.cat))];
  const filters = used.length > 1 ? `<div class="nfilters" role="group"><button data-cat="all" aria-pressed="true">${t.allCats}</button>${used.map((c) => `<button data-cat="${c}" aria-pressed="false">${CATS[c][lang === "fr" ? 0 : 1]}</button>`).join("")}</div>` : "";
  const grid = posts.length ? posts.map((p, i) => card(p, lang, i === 0)).join("") : `<p class="empty-news">${t.none}</p>`;
  const body = `<section class="page-hero"><div class="wrap">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="${t.base}">${t.home}</a><span>›</span><span aria-current="page">${t.news}</span></nav>
  <span class="eyebrow">SCOOP-CA Maendeleo</span><h1>${t.news}</h1><p class="lead">${t.lead}</p>${filters}
</div></section>
<section class="news-list"><div class="wrap"><div class="ngrid" id="newsGrid">${grid}</div></div></section>`;
  write(`${t.newsBase.slice(1)}index.html`, shell(lang, {
    title: lang === "fr" ? "Actualités de la coopérative | SCOOP-CA Maendeleo, café du Sud-Kivu" : "News from the cooperative | SCOOP-CA Maendeleo, South Kivu coffee",
    description: t.lead, canonical: t.newsBase, ogImage: posts[0]?.img.og || DEFAULT_IMG.og,
    alternates: [["fr", "/actualites/"], ["en", "/en/news/"], ["x-default", "/actualites/"]],
    frUrl: "/actualites/", enUrl: "/en/news/", body,
    jsonld: [crumbsLd([[t.home, t.base], [t.news, t.newsBase]]),
      { "@context": "https://schema.org", "@type": "CollectionPage", name: t.news, url: SITE + t.newsBase, inLanguage: lang, publisher: ORG_REF }],
  }));
}

/* ---------- 8. article pages ---------- */
for (const p of posts) {
  for (const lang of ["fr", "en"]) {
    if (lang === "en" && !p.en) continue;
    const t = T[lang], v = view(p, lang);
    const frUrl = `/actualites/${p.slug}/`, enUrl = p.en ? `/en/news/${p.slug}/` : "/en/news/";
    const alternates = p.en ? [["fr", frUrl], ["en", enUrl], ["x-default", frUrl]] : [];
    const others = posts.filter((x) => x !== p).slice(0, 3);
    const shareUrl = encodeURIComponent(SITE + v.url), shareTxt = encodeURIComponent(v.title);
    const body = `<article class="article"><div class="wrap">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="${t.base}">${t.home}</a><span>›</span><a href="${t.newsBase}">${t.news}</a><span>›</span><span aria-current="page">${esc(clip(v.title, 60))}</span></nav>
  <div class="meta"><span class="ncat ${v.catKey}">${esc(v.cat)}</span><time class="ndate" datetime="${v.iso}">${v.date}</time><span class="ndate">· ${v.minutes} ${t.min}</span></div>
  <h1>${esc(v.title)}</h1>
  <p class="lede">${esc(v.excerpt)}</p>
  ${p.image ? `<figure>${imgTag(v.img, "(max-width:1120px) 100vw, 1120px", ' fetchpriority="high" decoding="async"')}${p.imageAlt && p.imageAlt !== p.fr.title ? `<figcaption>${esc(p.imageAlt)}</figcaption>` : ""}</figure>` : ""}
  <div class="prose">${v.html}</div>
  <div class="share"><b>${t.share}</b>
    <a href="https://wa.me/?text=${shareTxt}%20${shareUrl}" target="_blank" rel="noopener">WhatsApp</a>
    <a href="https://www.linkedin.com/sharing/share-offsite/?url=${shareUrl}" target="_blank" rel="noopener">LinkedIn</a>
    <a href="https://www.facebook.com/sharer/sharer.php?u=${shareUrl}" target="_blank" rel="noopener">Facebook</a>
    <button type="button" id="copyLink" data-done="${t.copied}">${t.copy}</button>
  </div>
</div></article>
${others.length ? `<section class="related"><div class="wrap"><h2>${t.more}</h2><div class="ngrid">${others.map((o) => card(o, lang)).join("")}</div></div></section>` : ""}`;
    write(`${v.url.slice(1)}index.html`, shell(lang, {
      title: `${v.title} | SCOOP-CA Maendeleo`, description: v.excerpt, canonical: v.url, alternates, ogImage: p.img.og, ogType: "article",
      frUrl, enUrl, body,
      jsonld: [
        { "@context": "https://schema.org", "@type": "NewsArticle", headline: clip(v.title, 110), description: v.excerpt, inLanguage: lang,
          datePublished: p.iso, dateModified: p.iso, image: [SITE + p.img.og], mainEntityOfPage: SITE + v.url,
          author: ORG_REF, publisher: ORG_REF, articleSection: v.cat },
        crumbsLd([[t.home, t.base], [t.news, t.newsBase], [v.title, v.url]]),
      ],
    }));
  }
}

/* ---------- 9. RSS feeds ---------- */
for (const lang of ["fr", "en"]) {
  const t = T[lang];
  const items = posts.map((p) => view(p, lang)).map((v) => `  <item>
    <title>${esc(v.title)}</title>
    <link>${SITE}${v.url}</link>
    <guid isPermaLink="true">${SITE}${v.url}</guid>
    <pubDate>${new Date(v.iso + "T08:00:00Z").toUTCString()}</pubDate>
    <category>${esc(v.cat)}</category>
    <description>${esc(v.excerpt)}</description>
  </item>`).join("\n");
  write(`${t.newsBase.slice(1)}feed.xml`, `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>SCOOP-CA Maendeleo — ${t.news}</title>
  <link>${SITE}${t.newsBase}</link>
  <description>${esc(t.lead)}</description>
  <language>${lang}</language>
${items}
</channel></rss>
`);
}

/* ---------- 10. sitemap, robots, 404 ---------- */
const url = (loc, lastmod, alts = []) => `  <url><loc>${SITE}${loc}</loc><lastmod>${lastmod}</lastmod>${alts.map(([hl, u]) => `\n    <xhtml:link rel="alternate" hreflang="${hl}" href="${SITE}${u}"/>`).join("")}</url>`;
const homeAlts = [["fr", "/"], ["en", "/en/"], ["x-default", "/"]];
const listAlts = [["fr", "/actualites/"], ["en", "/en/news/"], ["x-default", "/actualites/"]];
const latest = posts[0]?.iso || TODAY;
const urls = [url("/", TODAY, homeAlts), url("/en/", TODAY, homeAlts), url("/actualites/", latest, listAlts), url("/en/news/", latest, listAlts)];
for (const p of posts) {
  const alts = p.en ? [["fr", `/actualites/${p.slug}/`], ["en", `/en/news/${p.slug}/`], ["x-default", `/actualites/${p.slug}/`]] : [];
  urls.push(url(`/actualites/${p.slug}/`, p.iso, alts));
  if (p.en) urls.push(url(`/en/news/${p.slug}/`, p.iso, alts));
}
write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join("\n")}
</urlset>
`);
write("robots.txt", `User-agent: *\nAllow: /\nDisallow: /admin/\n\nSitemap: ${SITE}/sitemap.xml\n`);
write("404.html", shell("fr", {
  title: "Page introuvable | SCOOP-CA Maendeleo", description: T.fr.notFoundT, canonical: "/404.html", ogImage: DEFAULT_IMG.og, frUrl: "/", enUrl: "/en/",
  body: `<section class="page-hero" style="min-height:60vh"><div class="wrap"><span class="eyebrow">404</span><h1>${T.fr.notFound}</h1><p class="lead">${T.fr.notFoundT} / ${T.en.notFoundT}</p><p style="margin-top:2rem;display:flex;gap:.8rem;flex-wrap:wrap"><a class="btn btn-primary" href="/">${T.fr.back}</a><a class="btn" style="border:1.5px solid #e4d8c4" href="/en/">${T.en.back}</a></p></div></section>`,
}).replace('<meta name="robots" content="index,follow,max-image-preview:large">', '<meta name="robots" content="noindex">'));

console.log(`Built ${posts.length} article(s) → dist/`);
