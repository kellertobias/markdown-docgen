import { mkdir, readFile, rm, writeFile, copyFile, readdir } from "node:fs/promises";
import path from "node:path";
import { zipSync, type Zippable } from "fflate";
import type { ManualControlSequencePresentation, ManualKey, ManualModel, ManualNode, ResolvedConfig, SourcePage } from "./types.js";
import { resolvePageLink, slug } from "./markdown.js";
import { tableColumnWidths } from "./tables.js";
import { imageDisplayWidth } from "./images.js";
import { calloutAppearance } from "./callouts.js";

function escape(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function localImage(model: ManualModel, page: SourcePage, url: string): { source: string; output: string; href: string } {
  const source = path.resolve(path.dirname(page.absolutePath), decodeURIComponent(url.split("#", 1)[0]));
  const relative = path.relative(model.sourceRoot, source).split(path.sep).join("/");
  return { source, output: `assets/content/${relative}`, href: `assets/content/${relative.split("/").map(encodeURIComponent).join("/")}` };
}

function wikiImage(model: ManualModel, page: SourcePage, url: string): { source: string; output: string; href: string } {
  return localImage(model, page, url.split("|", 1)[0]);
}

interface RenderContext {
  model: ManualModel;
  page: SourcePage;
  headingIndex: number;
  assets: Map<string, string>;
  config: ResolvedConfig;
}

function renderChildren(node: ManualNode, context: RenderContext): string {
  return (node.children ?? []).map((child) => renderNode(child, context)).join("");
}

function renderKeys(keys: ManualKey[]): string {
  const icon = (name?: string): string => name === "shift"
    ? '<svg class="manual-key-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.7 2.2 7.3h3.1v6.4h5.4V7.3h3.1z"/></svg>'
    : name === "backspace"
      ? '<svg class="manual-key-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M6.2 3H14v10H6.2L1.8 8zM8 5.8l3.7 4.4m0-4.4L8 10.2"/></svg>'
      : "";
  const accessibleLabel = (key: ManualKey): string => key.label || (key.icon === "shift" ? "Shift" : key.icon === "backspace" ? "Backspace" : "Key");
  const renderKey = (key: ManualKey): string => `<kbd class="manual-key manual-key-${escape(key.variant ?? "regular")}" aria-label="${escape(accessibleLabel(key))}">${icon(key.icon)}${key.label ? `<span>${escape(key.label)}</span>` : ""}</kbd>`;
  const groups: string[] = [];
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (key.variant === "shift" && keys[index + 1]) {
      groups.push(`<span class="manual-shift-chord">${renderKey(key)}${renderKey(keys[index + 1])}</span>`);
      index += 1;
    } else groups.push(renderKey(key));
  }
  return groups.join('<span class="manual-key-plus" aria-hidden="true">+</span>');
}

function keySequence(node: ManualNode): string | undefined {
  const presentation = node.data?.presentation as { component?: string; keys?: ManualKey[] } | undefined;
  if (presentation?.component !== "key-sequence" || !presentation.keys) return undefined;
  return `<span class="manual-key-sequence">${renderKeys(presentation.keys)}</span>`;
}

function controlSequence(node: ManualNode): string | undefined {
  const presentation = node.data?.presentation as ManualControlSequencePresentation | undefined;
  if (presentation?.component !== "control-sequence") return undefined;
  return `<code class="manual-control-sequence">${presentation.segments.map((segment) => segment.keys ? renderKeys(segment.keys) : (segment.text ?? "").trim() ? `<span class="manual-control-text">${escape((segment.text ?? "").trim())}</span>` : "").join("")}</code>`;
}

function isCommandLine(node: ManualNode): boolean {
  return (node.data?.presentation as { component?: string } | undefined)?.component === "command-line";
}

function standaloneImage(node: ManualNode): boolean {
  if (node.type === "image" || node.type === "wikiImage") return true;
  if (node.type !== "paragraph") return false;
  const meaningful = (node.children ?? []).filter((child) => child.type !== "text" || child.value?.trim());
  return meaningful.length === 1 && ["image", "wikiImage"].includes(meaningful[0].type);
}

function renderNode(node: ManualNode, context: RenderContext): string {
  switch (node.type) {
    case "text": return escape((node.value ?? "").replace(/\r?\n/gu, " "));
    case "paragraph": return `<p>${renderChildren(node, context)}</p>`;
    case "strong": return `<strong>${renderChildren(node, context)}</strong>`;
    case "emphasis": return `<em>${renderChildren(node, context)}</em>`;
    case "delete": return `<del>${renderChildren(node, context)}</del>`;
    case "inlineCode": return controlSequence(node) ?? `<code${isCommandLine(node) ? ' class="manual-command-line"' : ""}>${escape(node.value ?? "")}</code>`;
    case "inlineToken": return keySequence(node) ?? `<span class="inline-token inline-token-${escape(String(node.data?.kind ?? "default"))}">${escape(node.value ?? "")}</span>`;
    case "break": return "<br>";
    case "thematicBreak": return "<hr>";
    case "code": return `<pre><code${node.lang ? ` class="language-${escape(node.lang)}"` : ""}>${escape(node.value ?? "")}</code></pre>`;
    case "mermaid": {
      const svg = typeof node.data?.mermaidSvg === "string" ? node.data.mermaidSvg : "";
      return `<figure class="mermaid-diagram">${svg}${node.alt ? `<figcaption>${escape(node.alt)}</figcaption>` : ""}</figure>`;
    }
    case "heading": {
      const heading = context.page.headings[context.headingIndex++];
      const depth = Math.min(6, Math.max(1, Number(node.data?.effectiveDepth ?? node.depth ?? 1)));
      return `<h${depth} id="${escape(heading.id)}">${renderChildren(node, context)}</h${depth}>`;
    }
    case "link": {
      const url = node.url ?? "";
      const external = /^(?:https?:|mailto:)/iu.test(url);
      const internal = !external ? resolvePageLink(context.model, context.page, url) : undefined;
      if (!external && !internal && !url.startsWith("#")) return `<span class="local-reference">${renderChildren(node, context)}</span>`;
      const href = internal ? `#${internal}` : url;
      return `<a href="${escape(href)}"${external ? ' target="_blank" rel="noreferrer"' : ""}>${renderChildren(node, context)}</a>`;
    }
    case "wikiLink": {
      const target = resolvePageLink(context.model, context.page, node.url ?? "");
      return target ? `<a href="#${escape(target)}">${escape(node.value ?? node.url ?? "")}</a>` : `<span class="broken-link">${escape(node.value ?? node.url ?? "")}</span>`;
    }
    case "image":
    case "wikiImage": {
      const image = node.type === "wikiImage" ? wikiImage(context.model, context.page, node.url ?? "") : localImage(context.model, context.page, node.url ?? "");
      context.assets.set(image.source, image.output);
      const alt = node.alt ?? node.value ?? "";
      const width = imageDisplayWidth(node);
      return `<figure><img src="${escape(image.href)}" alt="${escape(alt)}" loading="lazy"${width ? ` style="width:${escape(width)}"` : ""}><figcaption>${escape(alt)}</figcaption></figure>`;
    }
    case "blockquote": return `<blockquote>${renderChildren(node, context)}</blockquote>`;
    case "callout": {
      const kind = node.calloutType ?? "note";
      const appearance = calloutAppearance(kind, context.config.theme);
      return `<aside class="callout callout-${escape(appearance.canonical)} callout-type-${escape(kind)}" data-callout="${escape(kind)}" style="--callout-color:${escape(appearance.color)};--callout-background:${escape(appearance.background)}"><div class="callout-title"><span aria-hidden="true">${escape(appearance.icon)}</span>${escape(node.calloutTitle ?? kind)}</div><div class="callout-body">${renderChildren(node, context)}</div></aside>`;
    }
    case "list": {
      const tag = node.ordered ? "ol" : "ul";
      const start = node.ordered && node.start && node.start !== 1 ? ` start="${node.start}"` : "";
      return `<${tag}${start}>${renderChildren(node, context)}</${tag}>`;
    }
    case "listItem": {
      const task = node.checked === true ? " checked" : node.checked === false ? " unchecked" : "";
      return `<li${task ? ` class="task${task}"` : ""}>${renderChildren(node, context)}</li>`;
    }
    case "table": return `<div class="table-scroll"><table><colgroup>${tableColumnWidths(node).map((width) => `<col style="width:${(width * 100).toFixed(2)}%">`).join("")}</colgroup>${renderChildren(node, context)}</table></div>`;
    case "tableRow": return `<tr>${renderChildren(node, context)}</tr>`;
    case "tableCell": return `<td>${renderChildren(node, context)}</td>`;
    default: return renderChildren(node, context) || escape(node.value ?? "");
  }
}

function renderPage(model: ManualModel, page: SourcePage, assets: Map<string, string>, config: ResolvedConfig): string {
  const context: RenderContext = { model, page, headingIndex: 0, assets, config };
  let nodes = page.nodes;
  let divider = "";
  const isTopLevelIndex = page.isChapter && page.relativePath.split("/").length === 2;
  if (isTopLevelIndex) {
    const titleIndex = nodes.findIndex((node) => node.type === "heading" && Number(node.depth ?? 1) === 1);
    const dividerIndexes = new Set([titleIndex]);
    if (titleIndex > 0 && standaloneImage(nodes[titleIndex - 1])) dividerIndexes.add(titleIndex - 1);
    if (titleIndex >= 0 && standaloneImage(nodes[titleIndex + 1])) dividerIndexes.add(titleIndex + 1);
    divider = `<div class="manual-section-divider">${nodes.filter((_, index) => dividerIndexes.has(index)).map((node) => renderNode(node, context)).join("\n")}</div>`;
    nodes = nodes.filter((_, index) => !dividerIndexes.has(index));
  }
  const html = nodes.map((node) => renderNode(node, context)).join("\n");
  return `<article class="manual-page${isTopLevelIndex ? " top-level-page" : ""}" data-page="${page.id}" aria-labelledby="${page.id}">${divider}<div class="manual-page-content columns-${config.layout.columns}">${html}</div></article>`;
}

function navigation(model: ManualModel): string {
  return model.pages.map((page) => `<a class="nav-link${page.isChapter ? " chapter" : ""}" href="#${page.id}" data-page-link="${page.id}">${escape(page.title)}</a>`).join("");
}

function css(config: ResolvedConfig): string {
  const t = config.theme;
  const callouts = `.manual-page h3:after{height:.32rem}.callout{background:var(--callout-background,#eef8f8)}.manual-key{min-height:1.45rem;padding:.16rem .42rem;border-color:#59636d;border-radius:.48rem;box-shadow:0 1px 1px #0006,inset 0 1px #ffffff24}.manual-shift-chord{display:inline-flex;align-items:flex-end;padding:.08rem .04rem 0}.manual-shift-chord .manual-key-shift{z-index:0;min-height:0;padding:.08rem .21rem;transform:translateY(.15rem)}.manual-shift-chord .manual-key-shift+.manual-key{z-index:1;margin-left:-.28rem;transform:translateY(-.08rem)}.manual-command-line{padding:.16rem .42rem;border:1px solid #aeb8c2;border-radius:.4rem;background:#4b5563;box-shadow:none}.manual-control-sequence{display:inline-flex;align-items:center;gap:0;margin:0 .08rem;padding:.16rem .24rem;border:1px solid #334554;border-radius:.5rem;background:var(--code);color:#f4f7f9;box-shadow:inset 0 1px #ffffff18,0 1px 2px #0004;font:700 .86em/1.35 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:nowrap}.manual-control-sequence .manual-key{font-size:.9em}.manual-control-text{margin:0 .22rem}${Object.entries(t.callouts).map(([kind, color]) => `.callout-type-${kind}{--callout-color:${color}}`).join("")}`;
  return `:root{color-scheme:light;--accent:${t.accent};--accent-contrast:${t.accentContrast};--paper:${t.background};--danger:${t.calloutDanger};--info:${t.calloutInfo};--ink:${t.ink};--muted:${t.muted};--nav:${t.navigationBackground};--nav-ink:${t.navigationInk};--code:${t.codeBackground};font-family:Inter,ui-sans-serif,system-ui,sans-serif}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--paper);color:var(--ink);line-height:1.5}.nav-toggle{display:none}.sidebar{position:fixed;inset:0 auto 0 0;width:20rem;padding:1.2rem;overflow:auto;background:var(--nav);color:var(--nav-ink)}.brand{margin-bottom:1rem}.brand img{display:block;width:3rem;height:3rem;object-fit:contain}.brand strong{font-size:1.1rem}.search{position:sticky;top:0;padding:.6rem 0;background:var(--nav)}.search input{width:100%;padding:.7rem;border:1px solid #ffffff44;border-radius:.4rem;background:#ffffff12;color:inherit}.nav-link{display:block;padding:.38rem .55rem;border-left:3px solid transparent;color:inherit;text-decoration:none}.nav-link.chapter{margin-top:.5rem;color:${t.accent};font-weight:800}.nav-link.active{border-color:${t.accent};background:#ffffff12}.manual{margin-left:20rem}.hero{padding:5rem max(6vw,2rem);background:var(--nav);color:var(--nav-ink)}.hero img{width:5rem;height:5rem;object-fit:contain}.hero h1{font-size:clamp(2.7rem,7vw,5.3rem);line-height:1;margin:.8rem 0}.hero p{color:${t.accent}}.manual-page{max-width:70rem;margin:2.5rem auto;padding:3rem clamp(1.2rem,5vw,4.5rem);background:#fff;box-shadow:0 15px 45px #07162118}.top-level-page{padding-top:0}.manual-section-divider{display:flex;min-height:72vh;margin:0 clamp(-4.5rem,-5vw,-1.2rem) 3rem;padding:4rem;flex-direction:column;align-items:center;justify-content:center;background:var(--nav);color:var(--nav-ink);text-align:center}.manual-section-divider h1{margin:0;padding:0;background:none;font-size:clamp(2.8rem,7vw,5rem);letter-spacing:-.03em}.manual-section-divider h1:after{content:'';display:block;position:static;width:5rem;height:.28rem;margin:1.4rem auto 0;background:var(--accent)}.manual-section-divider figure{margin:1.8rem 0}.manual-section-divider img{width:10rem;height:10rem;object-fit:contain}.manual-section-divider figcaption{display:none}.manual-page-content.columns-2{column-count:2;column-gap:${config.layout.columnGap}px}.manual-page-content.columns-2>h2,.manual-page-content.columns-2>h3,.manual-page-content.columns-2>.table-scroll,.manual-page-content.columns-2>figure,.manual-page-content.columns-2>pre,.manual-page-content.columns-2>.callout{column-span:all}.manual-page-content p,.manual-page-content li{text-align:${config.layout.justifyText ? "justify" : "left"};hyphens:auto}.manual-page h2{position:relative;margin:2rem 0;padding:1.35rem 1.5rem 1.15rem;border-top:.32rem solid var(--accent);background:var(--nav);color:var(--nav-ink);letter-spacing:-.02em}.manual-page h2:before{content:'CHAPTER';display:block;margin-bottom:.35rem;color:var(--accent);font-size:.48em;letter-spacing:.18em}.manual-page h3{display:flex;align-items:center;gap:.8rem;margin:2rem 0 .8rem;padding:.25rem 0 .25rem .8rem;border-left:.32rem solid var(--accent);color:var(--accent)}.manual-page h3:after{content:'';height:.14rem;flex:1;background:var(--accent)}.manual-page h4{margin:1.4rem 0 .55rem;color:var(--accent)}.manual-page h5{margin:1.1rem 0 .45rem;color:var(--nav);font-size:1rem}a{color:var(--accent)}pre{overflow:auto;padding:1rem;border-radius:.4rem;background:var(--code);color:#e5f8f5}code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.inline-token{display:inline-block;margin:0 .1rem;padding:.05rem .35rem;border:1px solid #8896a3;border-radius:.3rem;background:#17202a;color:#ffb30f;font-size:.85em;font-weight:800}.manual-key-sequence{display:inline-flex;align-items:center;gap:.22rem;white-space:nowrap}.manual-key{display:inline-flex;min-height:1.65rem;align-items:center;gap:.28rem;padding:.16rem .5rem;border:1px solid #3a4652;border-bottom-width:3px;border-radius:.42rem;background:linear-gradient(#252c33,#171c22);color:#f4f7f9;box-shadow:0 1px 2px #0006,inset 0 1px #ffffff14;font:800 .78em/1.1 Inter,ui-sans-serif,sans-serif}.manual-key-icon{width:.9rem;height:.9rem;fill:none;stroke:currentColor;stroke-width:1.55;stroke-linecap:round;stroke-linejoin:round}.manual-key-plus{color:var(--muted);font-size:.72em;font-weight:800}.manual-key-record{border-color:#ff6872;border-bottom-color:#70181f;background:linear-gradient(#421116,#21090c);color:#ff8b93}.manual-key-clear{border-color:#d6a600;border-bottom-color:#806000;background:linear-gradient(#493b05,#261d08);color:#f0c52f}.manual-key-preload{border-color:#4ea8de;border-bottom-color:#15577e;background:linear-gradient(#123d58,#09283d);color:#8bd3ff}.manual-key-shift{border-color:#8d99a6;background:linear-gradient(#39434d,#20272e);color:#fff}.manual-key-keyboard{border-color:#d8dee5;border-bottom-color:#8b98a4;background:linear-gradient(#fff,#f3f4f6);color:#17202a;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.manual-command-line{display:inline-block;margin:0 .08rem;padding:.08rem .42rem;border:1px solid #aeb8c2;border-bottom-width:2px;border-radius:.38rem;background:linear-gradient(#5d6874,#414b56);color:#fff;box-shadow:inset 0 1px #ffffff26,0 1px 1px #0003;font:700 .86em/1.25 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:nowrap}.table-scroll{margin:1rem 0;overflow-x:auto}table{width:100%;table-layout:fixed;border-collapse:collapse}td,th{padding:.5rem .6rem;border:0;border-right:1px solid #d8dee5;border-bottom:1px solid #d8dee5;vertical-align:top;text-align:left;overflow-wrap:anywhere}td:last-child,th:last-child{border-right:0}tr:first-child td{background:var(--nav);color:var(--nav-ink);font-weight:700}tr:nth-child(odd):not(:first-child) td{background:#f3f6f7}figure{margin:1.6rem auto;text-align:center}figure img{display:block;max-width:100%;max-height:70vh;margin:auto}.mermaid-diagram svg{display:block;width:100%;max-width:70rem;height:auto;max-height:70vh;margin:auto}.mermaid-diagram .nodeLabel,.mermaid-diagram .edgeLabel{font-family:Inter,ui-sans-serif,system-ui,sans-serif}figcaption{margin-top:.35rem;color:var(--muted);font-size:.8rem;font-style:italic}.callout{--callout-color:var(--info);margin:1.3rem 0;padding:1rem 1.1rem;border-left:.35rem solid var(--callout-color);background:#eef8f8}.callout-danger{--callout-color:var(--danger);background:#fff0ee}.callout-title{display:flex;gap:.5rem;align-items:center;font-weight:800;color:var(--callout-color)}.callout-body>:first-child{margin-top:.5rem}.callout-body>:last-child{margin-bottom:0}.broken-link{color:var(--danger);text-decoration:underline wavy}.task.checked{list-style:'☑  '}.task.unchecked{list-style:'☐  '}.no-results{padding:3rem;text-align:center;color:var(--muted)}${callouts}@media(max-width:850px){.nav-toggle{display:block;position:fixed;right:1rem;top:1rem;z-index:3}.sidebar{transform:translateX(-105%);transition:transform .2s;z-index:2}.sidebar.open{transform:none}.manual{margin-left:0}.manual-page{margin:1rem;padding:2rem 1.2rem}.manual-section-divider{margin:-2rem -1.2rem 2rem;padding:2rem}.manual-page-content.columns-2{column-count:1}}@media print{.sidebar,.nav-toggle,.search{display:none!important}.manual{margin:0}.hero{break-after:page}.manual-page{max-width:none;margin:0;padding:1.4cm;box-shadow:none;break-before:page}.manual-section-divider{min-height:24cm;margin:-1.4cm -1.4cm 1.4cm;break-after:page}}`;
}

const script = `(()=>{const q=document.querySelector('#search'),pages=[...document.querySelectorAll('.manual-page')],links=[...document.querySelectorAll('.nav-link')],side=document.querySelector('.sidebar'),toggle=document.querySelector('.nav-toggle'),empty=document.querySelector('.no-results');function active(){const id=location.hash.slice(1);links.forEach(a=>a.classList.toggle('active',a.dataset.pageLink===id))}addEventListener('hashchange',active);active();toggle.addEventListener('click',()=>side.classList.toggle('open'));links.forEach(a=>a.addEventListener('click',()=>side.classList.remove('open')));q.addEventListener('input',()=>{const term=q.value.trim().toLocaleLowerCase();let count=0;pages.forEach(p=>{const show=!term||p.textContent.toLocaleLowerCase().includes(term);p.hidden=!show;if(show)count++});links.forEach(a=>{const p=document.querySelector('[data-page="'+CSS.escape(a.dataset.pageLink)+'"]');a.hidden=!!term&&p.hidden});empty.hidden=count!==0})})();`;

async function collectFiles(directory: string, prefix = ""): Promise<Record<string, Uint8Array>> {
  const files: Record<string, Uint8Array> = {};
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) Object.assign(files, await collectFiles(path.join(directory, entry.name), relative));
    else files[relative] = new Uint8Array(await readFile(path.join(directory, entry.name)));
  }
  return files;
}

export async function renderHtml(model: ManualModel, config: ResolvedConfig): Promise<void> {
  const site = config.output.htmlDir;
  await rm(site, { recursive: true, force: true });
  await mkdir(site, { recursive: true });
  const assets = new Map<string, string>();
  let logo = "";
  if (config.logo) {
    const extension = path.extname(config.logo) || ".png";
    logo = `assets/brand/logo${extension}`;
    assets.set(config.logo, logo);
  }
  const pages = model.pages.map((page) => renderPage(model, page, assets, config)).join("\n");
  for (const [source, relative] of assets) {
    const destination = path.join(site, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(source, destination);
  }
  const logoHtml = logo ? `<img src="${escape(logo)}" alt="">` : "";
  const document = `<!doctype html><html lang="${escape(config.language ?? "en")}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${escape(config.description ?? config.subtitle ?? config.title)}"><title>${escape(config.title)}</title><style>${css(config)}</style></head><body><button class="nav-toggle" type="button" aria-label="Toggle contents">Contents</button><aside class="sidebar"><div class="brand">${logoHtml}<strong>${escape(config.title)}</strong>${config.version ? `<small> ${escape(config.version)}</small>` : ""}</div><div class="search"><label for="search">Search the manual</label><input id="search" type="search"></div><nav aria-label="Contents">${navigation(model)}</nav></aside><main class="manual"><header class="hero">${logoHtml}<h1>${escape(config.title)}</h1>${config.subtitle ? `<p>${escape(config.subtitle)}</p>` : ""}</header>${pages}<p class="no-results" hidden>No matching page.</p></main><script>${script}</script></body></html>`;
  await writeFile(path.join(site, "index.html"), document);
  if (config.output.htmlArchive) {
    const files = await collectFiles(site);
    const fixed = new Date("2020-01-01T00:00:00Z");
    const entries: Zippable = {};
    for (const [name, data] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
      entries[name] = [data, { mtime: fixed }];
    }
    const zipped = zipSync(entries, { level: 9 });
    await mkdir(path.dirname(config.output.htmlArchive), { recursive: true });
    await writeFile(config.output.htmlArchive, zipped);
  }
}
