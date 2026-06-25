"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

function createEventTarget(extra = {}) {
  const listeners = {};
  return {
    hidden: true,
    listeners,
    addEventListener(type, handler) {
      (listeners[type] = listeners[type] || []).push(handler);
    },
    removeEventListener(type, handler) {
      listeners[type] = (listeners[type] || []).filter((fn) => fn !== handler);
    },
    dispatch(type, event = {}) {
      for (const handler of [...(listeners[type] || [])]) handler(event);
    },
    ...extra
  };
}

async function loadLightbox() {
  const modulePath = pathToFileURL(path.join(repoRoot, "web", "js", "image-lightbox.js")).href;
  return import(`${modulePath}?test=${Date.now()}`);
}

test("app shell ships a reusable image lightbox container", async () => {
  const index = await fs.readFile(path.join(repoRoot, "index.html"), "utf8");

  assert.match(index, /id="imageLightbox"/);
  assert.match(index, /id="imageLightboxImg"/);
  assert.match(index, /id="imageLightboxClose"/);
  assert.match(index, /id="imageLightboxError"/);
});

test("table thumbnails are marked as clickable lightbox triggers", async () => {
  const source = await fs.readFile(path.join(repoRoot, "web", "js", "ltc-app-render-methods.js"), "utf8");

  assert.match(source, /image-thumbnail/);
  assert.match(source, /data-caption=/);
});

test("lightbox opens a clicked thumbnail and closes via backdrop and Esc", async () => {
  const { ImageLightbox } = await loadLightbox();

  const overlay = createEventTarget();
  const image = createEventTarget({ src: "", alt: "" });
  const caption = createEventTarget({ textContent: "" });
  const errorText = createEventTarget();
  const closeButton = createEventTarget({ focus() {} });

  const documentListeners = {};
  global.document = {
    activeElement: { focus() {} },
    body: {
      classes: new Set(),
      classList: {
        add(name) {
          global.document.body.classes.add(name);
        },
        remove(name) {
          global.document.body.classes.delete(name);
        },
        contains(name) {
          return global.document.body.classes.has(name);
        }
      }
    },
    addEventListener(type, handler) {
      (documentListeners[type] = documentListeners[type] || []).push(handler);
    },
    removeEventListener(type, handler) {
      documentListeners[type] = (documentListeners[type] || []).filter((fn) => fn !== handler);
    },
    dispatch(type, event = {}) {
      for (const handler of [...(documentListeners[type] || [])]) handler(event);
    }
  };

  const lightbox = new ImageLightbox({ overlay, image, caption, errorText, closeButton });
  lightbox.init();

  const thumb = {
    dataset: { caption: "นางสาวสมหญิง ใจดี" },
    getAttribute(name) {
      if (name === "src") return "data:image/png;base64,iVBORw0KGgo=";
      if (name === "alt") return "นางสาวสมหญิง ใจดี";
      return null;
    },
    closest(selector) {
      return selector === ".image-thumbnail" ? thumb : null;
    }
  };

  let prevented = false;
  let stopped = false;
  global.document.dispatch("click", {
    target: thumb,
    preventDefault() {
      prevented = true;
    },
    stopPropagation() {
      stopped = true;
    }
  });

  assert.equal(prevented, true);
  assert.equal(stopped, false, "thumbnail click must still reach table row-selection handlers");
  assert.equal(overlay.hidden, false);
  assert.equal(image.src, "data:image/png;base64,iVBORw0KGgo=");
  assert.equal(caption.textContent, "นางสาวสมหญิง ใจดี");
  assert.equal(global.document.body.classList.contains("lightbox-open"), true);

  // Esc closes the overlay.
  global.document.dispatch("keydown", { key: "Escape", preventDefault() {} });
  assert.equal(overlay.hidden, true);
  assert.equal(global.document.body.classList.contains("lightbox-open"), false);

  // Backdrop click reopens then closes.
  lightbox.open(thumb);
  assert.equal(overlay.hidden, false);
  overlay.dispatch("click", { target: overlay });
  assert.equal(overlay.hidden, true);
});

test("thumbnail clicks can still bubble to table row selection", async () => {
  const source = await fs.readFile(path.join(repoRoot, "web", "js", "image-lightbox.js"), "utf8");

  assert.doesNotMatch(
    source,
    /stopPropagation\(\)/,
    "thumbnail clicks must not block the table row click handler from selecting the row"
  );
});

test("lightbox shows a graceful fallback when an image fails to load", async () => {
  const { ImageLightbox } = await loadLightbox();

  const overlay = createEventTarget();
  const image = createEventTarget({ src: "", alt: "" });
  const caption = createEventTarget({ textContent: "" });
  const errorText = createEventTarget();
  const closeButton = createEventTarget({ focus() {} });

  global.document = {
    activeElement: null,
    body: { classList: { add() {}, remove() {} } },
    addEventListener() {},
    removeEventListener() {}
  };

  const lightbox = new ImageLightbox({ overlay, image, caption, errorText, closeButton });
  lightbox.init();

  image.dispatch("error");
  assert.equal(image.hidden, true);
  assert.equal(errorText.hidden, false);
});
