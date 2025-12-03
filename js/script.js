const nav = document.querySelector(".nav");
const navMenu = document.querySelector(".nav--menu");
const hamburger = document.querySelector(".nav--hamburger");
const navLinks = document.querySelectorAll(".nav--link");

// Helper function to open the menu
const openMenu = () => {
  navMenu.classList.add("open");
  nav.classList.add("open");
  hamburger.classList.add("is-active");
}

// Helper function to close the menu
const closeMenu = () => {
  navMenu.classList.remove("open");
  nav.classList.remove("open");
  hamburger.classList.remove("is-active");
}

// Toggle menu on hamburger click
hamburger.addEventListener("click", () => {
  if (navMenu.classList.contains("open")) closeMenu();
  else openMenu();
});

// Close menu on link click
navLinks.forEach(link => link.addEventListener("click", closeMenu));

//Button redirection to another page
const newsletterBtn = document.querySelector(".nav--cta .btn--cta");
newsletterBtn?.addEventListener("click", () => {
  window.location.href = "newsletter.html";
})

// //Clear Service Worker SINGLE USE
// if ('serviceWorker' in navigator) {
//   navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
// }

