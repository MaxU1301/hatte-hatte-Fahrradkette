/* Toggle a transparent header when the hero is in view.
   Works with Material's instant loading via document$ */
let heroObserver;

document$.subscribe(() => {
  const header = document.querySelector(".md-header");
  const hero = document.querySelector(".hero-cover");

  if (heroObserver) {
    heroObserver.disconnect();
    heroObserver = null;
  }
  if (!header || !hero) return;

  const cls = "md-header--transparent";

  heroObserver = new IntersectionObserver(
    (entries) => {
      const entry = entries[0];
      if (entry && entry.isIntersecting) header.classList.add(cls);
      else header.classList.remove(cls);
    },
    {
      /* Start turning opaque a bit before the header would overlap */
      root: null,
      rootMargin: "-64px 0px 0px 0px",
      threshold: 0,
    }
  );

  heroObserver.observe(hero);
});