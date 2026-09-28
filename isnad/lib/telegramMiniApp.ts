export function bindTelegramViewport(element: HTMLElement) {
  const visualViewport = window.visualViewport;

  const sync = () => {
    const height = Math.round(visualViewport?.height ?? window.innerHeight);
    const offsetTop = Math.max(0, Math.round(visualViewport?.offsetTop ?? 0));
    const keyboardInset = Math.max(0, window.innerHeight - height - offsetTop);
    const keyboardOpen = keyboardInset > 120;

    element.style.setProperty("--tg-live-height", `${height}px`);
    element.style.setProperty("--tg-viewport-offset-top", `${offsetTop}px`);
    element.dataset.keyboardOpen = keyboardOpen ? "true" : "false";
  };

  sync();
  visualViewport?.addEventListener("resize", sync);
  visualViewport?.addEventListener("scroll", sync);
  window.addEventListener("resize", sync);

  return () => {
    visualViewport?.removeEventListener("resize", sync);
    visualViewport?.removeEventListener("scroll", sync);
    window.removeEventListener("resize", sync);
    delete element.dataset.keyboardOpen;
    element.style.removeProperty("--tg-live-height");
    element.style.removeProperty("--tg-viewport-offset-top");
  };
}

export function navigateBackInsideTelegram(fallback = "/telegram") {
  try {
    const referrer = document.referrer ? new URL(document.referrer) : null;
    if (
      referrer &&
      referrer.origin === window.location.origin &&
      referrer.pathname.startsWith("/telegram")
    ) {
      window.history.back();
      return;
    }
  } catch {
    // Fall through to the stable Mini App root.
  }

  window.location.assign(fallback);
}
