/* Make header transparent while hero is under it, with robust scroll/resize.
   Works with Material's instant loading via document$. */

let cleanupHero;

document$.subscribe(() => {
  // Clean up prior run (soft navigation)
  if (typeof cleanupHero === "function") {
    cleanupHero();
    cleanupHero = null;
  }

  const body = document.body;
  const header = document.querySelector(".md-header");
  const hero = document.querySelector(".hero-cover");

  // Reset global state
  header?.classList.remove("md-header--transparent");
  body.classList.remove("hero-page", "over-hero");
  document.documentElement.style.removeProperty("--hero-header-h");

  if (!header || !hero) return;

  const CLS_HEADER_TRANSPARENT = "md-header--transparent";
  const CLS_HERO_PAGE = "hero-page";
  const CLS_OVER_HERO = "over-hero";

  body.classList.add(CLS_HERO_PAGE);

  // Measure and expose header height for CSS positioning of tabs
  const measure = () => Math.max(48, Math.round(header.offsetHeight || 64));
  let headerH = measure();
  document.documentElement.style.setProperty("--hero-header-h", `${headerH}px`);

  // Update transparency based on scroll position
  const update = () => {
    // Re-measure in case fonts/layout changed
    const newH = measure();
    if (newH !== headerH) {
      headerH = newH;
      document.documentElement.style.setProperty(
        "--hero-header-h",
        `${headerH}px`
      );
    }

    // Determine the scroll threshold. The header should become opaque when the user
    // has scrolled past the hero image, minus the height of the header itself.
    const threshold = hero.offsetHeight - headerH*2.5;
    const overHero = window.scrollY < threshold;

    header.classList.toggle(CLS_HEADER_TRANSPARENT, overHero);
    body.classList.toggle(CLS_OVER_HERO, overHero);
  };

  // Initial state: treat as over-hero to avoid any flash
  header.classList.add(CLS_HEADER_TRANSPARENT);
  body.classList.add(CLS_OVER_HERO);
  // Do a real update on the next frame
  requestAnimationFrame(update);

  // Wire events
  const onScroll = () => update();
  const onResize = () => update();

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onResize);

  cleanupHero = () => {
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onResize);
    header.classList.remove(CLS_HEADER_TRANSPARENT);
    body.classList.remove(CLS_HERO_PAGE, CLS_OVER_HERO);
    document.documentElement.style.removeProperty("--hero-header-h");
  };
});