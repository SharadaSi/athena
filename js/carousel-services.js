/**
 * Infinite horizontal carousel for .carousel-services-item
 * Wraps items in a track element, duplicates for seamless looping,
 * then translates the track via GSAP.
 * The CSS mask-image on the outer container handles edge fade.
 */

import { gsap } from "./vendor/gsap.js";

const container = document.querySelector(".carousel-services--items-container");
if (container) {
  // Wrap all items in a track div we can translate independently
  const track = document.createElement("div");
  track.className = "carousel-services--track";
  while (container.firstChild) track.appendChild(container.firstChild);
  container.appendChild(track);

  // Duplicate items for seamless looping
  track.innerHTML += track.innerHTML;

  const totalWidth = track.scrollWidth / 2;

  gsap.to(track, {
    x: -totalWidth,
    duration: totalWidth / 50, // ~50 px/s
    ease: "none",
    repeat: -1,
  });
}
