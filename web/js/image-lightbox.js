/**
 * Reusable, local-only image lightbox.
 *
 * Listens (via event delegation) for clicks/keyboard activation on any
 * `.image-thumbnail` element in the document and opens the referenced image
 * full-size in a centred overlay. It reuses the thumbnail's own `src`
 * (which is a local data URL), so it never fetches anything external.
 */
export class ImageLightbox {
  constructor(elements = {}) {
    this.overlay = elements.overlay || null;
    this.image = elements.image || null;
    this.caption = elements.caption || null;
    this.errorText = elements.errorText || null;
    this.closeButton = elements.closeButton || null;
    this.lastFocused = null;

    this.handleDocumentClick = this.handleDocumentClick.bind(this);
    this.handleDocumentKeydown = this.handleDocumentKeydown.bind(this);
    this.handleOverlayKeydown = this.handleOverlayKeydown.bind(this);
  }

  init() {
    if (!this.overlay || !this.image) return;

    // Capture phase so the thumbnail click does not also trigger row-selection
    // handlers bound on the table bodies.
    document.addEventListener("click", this.handleDocumentClick, true);
    document.addEventListener("keydown", this.handleDocumentKeydown);

    this.overlay.addEventListener("click", (event) => {
      // Only the backdrop (the overlay itself) closes; clicks on the frame stay open.
      if (event.target === this.overlay) this.close();
    });
    this.closeButton?.addEventListener("click", () => this.close());

    this.image.addEventListener("load", () => this.showReady());
    this.image.addEventListener("error", () => this.showError());
  }

  handleDocumentClick(event) {
    const thumb = this.findThumbnail(event.target);
    if (!thumb) return;
    event.preventDefault();
    this.open(thumb);
  }

  handleDocumentKeydown(event) {
    if (event.key !== "Enter" && event.key !== " " && event.key !== "Spacebar") return;
    const thumb = this.findThumbnail(event.target);
    if (!thumb) return;
    event.preventDefault();
    this.open(thumb);
  }

  handleOverlayKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      this.close();
    }
  }

  findThumbnail(target) {
    if (!target || typeof target.closest !== "function") return null;
    return target.closest(".image-thumbnail");
  }

  open(thumb) {
    const src = thumb.getAttribute("src") || thumb.currentSrc || thumb.src || "";
    if (!src) return;

    const caption = thumb.dataset?.caption || thumb.getAttribute("alt") || "";
    this.lastFocused = document.activeElement;

    if (this.errorText) this.errorText.hidden = true;
    this.image.hidden = false;
    this.image.alt = caption;
    this.image.src = src;

    if (this.caption) this.caption.textContent = caption;

    this.overlay.hidden = false;
    document.body.classList.add("lightbox-open");
    document.addEventListener("keydown", this.handleOverlayKeydown);

    // Move keyboard focus into the dialog for Esc/Tab handling.
    try {
      this.closeButton?.focus({ preventScroll: true });
    } catch {
      this.closeButton?.focus?.();
    }
  }

  close() {
    if (!this.overlay || this.overlay.hidden) return;

    this.overlay.hidden = true;
    document.body.classList.remove("lightbox-open");
    document.removeEventListener("keydown", this.handleOverlayKeydown);

    if (this.lastFocused && typeof this.lastFocused.focus === "function") {
      try {
        this.lastFocused.focus({ preventScroll: true });
      } catch {
        // The previously focused element may have been re-rendered; ignore.
      }
    }
    this.lastFocused = null;
  }

  showReady() {
    this.image.hidden = false;
    if (this.errorText) this.errorText.hidden = true;
  }

  showError() {
    this.image.hidden = true;
    if (this.errorText) this.errorText.hidden = false;
  }
}
