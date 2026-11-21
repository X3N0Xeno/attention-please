// video-context.js — CONTENT SCRIPT (needs the DOM). Exposes global getVideoContext().
// List it BEFORE content.js in manifest content_scripts so content.js can call it.
// Never load config.js in a content script.
// Note: styles.css only makes text transparent; textContent still reads it fine.

async function getVideoContext() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const pick = (sels, attr) => {
    for (const s of sels) {
      const el = document.querySelector(s);
      const v = el && (attr ? el.getAttribute(attr) : el.textContent);
      if (v && v.trim()) return v.trim();
    }
    return "";
  };

  // If called at document_start, wait for DOM interactive/complete before polling selectors.
  if (document.readyState === "loading") {
    await new Promise((r) => document.addEventListener("DOMContentLoaded", r, { once: true }));
  }

  // YouTube is a SPA: after a click, the DOM/meta can still belong to the PREVIOUS page.
  // Wait until the watch element reports the same video id as the URL (skip on /shorts/).
  const url = new URL(location.href);
  const vid = url.searchParams.get("v"); // null on /shorts/
  const videoId =
    vid ||
    (url.pathname.startsWith("/shorts/") ? url.pathname.split("/shorts/")[1]?.split("/")[0] || "" : "");
  if (vid) {
    for (let i = 0; i < 30; i++) {
      const flexy = document.querySelector("ytd-watch-flexy");
      const idOk = flexy && flexy.getAttribute("video-id") === vid;
      if (idOk && pick(["h1.ytd-watch-metadata yt-formatted-string", "h1.ytd-watch-metadata"])) break;
      await sleep(300);
    }
  }

  // Comments load lazily (only after the user scrolls), so this is often empty. That's fine.
  const comments = [...document.querySelectorAll("ytd-comment-thread-renderer #content-text")]
    .slice(0, 5)
    .map((c) => c.textContent.trim().slice(0, 200))
    .filter(Boolean);

  const docTitle = document.title.replace(/^\(\d+\)\s*/, "").replace(/\s*-\s*YouTube\s*$/i, "").trim();

  return {
    videoId,
    title:
      pick(["h1.ytd-watch-metadata yt-formatted-string", "h1.ytd-watch-metadata"]) ||
      (docTitle && docTitle.toLowerCase() !== "youtube" ? docTitle : "") ||
      pick(["meta[name='title']"], "content"),
    channel: pick(["#owner #channel-name a", "ytd-channel-name a"]) ||
             pick(["link[itemprop='name']"], "content"),
    description:
      pick(["#description-inner", "ytd-text-inline-expander"]).replace(/\s+/g, " ").slice(0, 800) ||
      pick(["meta[name='description']"], "content").replace(/\s+/g, " ").slice(0, 800),
    comments,
  };
}
