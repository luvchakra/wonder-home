"use client";

import { useEffect } from "react";

/**
 * The landing page's motion system (requirements §41), in one small script.
 *
 * Scroll reveal: every `.wh-reveal` element gets `.is-visible` the first time
 * it enters the viewport, and the CSS does the rest. Parallax: elements with
 * `data-parallax="0.2"` are translated by that fraction of their distance from
 * the viewport centre, on a single rAF-throttled scroll listener, transforms
 * only. Under prefers-reduced-motion nothing here runs and the stylesheet
 * already shows everything in place.
 */
export function Reveal() {
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const revealables = Array.from(document.querySelectorAll<HTMLElement>(".wh-reveal"));

    if (reduced || !("IntersectionObserver" in window)) {
      for (const element of revealables) element.classList.add("is-visible");
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.12 },
    );
    for (const element of revealables) observer.observe(element);

    const layers = Array.from(document.querySelectorAll<HTMLElement>("[data-parallax]"));
    let ticking = false;
    const update = () => {
      ticking = false;
      const middle = window.innerHeight / 2;
      for (const layer of layers) {
        const factor = Number(layer.dataset.parallax ?? "0");
        const rect = layer.getBoundingClientRect();
        const offset = (rect.top + rect.height / 2 - middle) * factor;
        layer.style.transform = `translate3d(0, ${offset.toFixed(1)}px, 0)`;
      }
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(update);
      }
    };

    if (layers.length > 0) {
      update();
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll);
    }

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return null;
}
