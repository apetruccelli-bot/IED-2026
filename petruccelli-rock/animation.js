const photos = document.querySelectorAll(".photo");
const title = document.querySelector(".title");

const finalRotations = [-7, 6, 4, -5, 2, 8, 0];

gsap.set(title, {
  opacity: 0,
  y: 14
});

photos.forEach((photo) => {
  const corner = gsap.utils.random([
    { x: -window.innerWidth, y: -window.innerHeight },
    { x: window.innerWidth, y: -window.innerHeight },
    { x: -window.innerWidth, y: window.innerHeight },
    { x: window.innerWidth, y: window.innerHeight }
  ]);

  gsap.set(photo, {
    x: corner.x,
    y: corner.y,
    rotation: gsap.utils.random(-80, 80),
    opacity: 0
  });
});

const tl = gsap.timeline();

photos.forEach((photo, index) => {
  tl.to(photo, {
    x: 0,
    y: 0,
    rotation: finalRotations[index],
    opacity: 1,
    duration: gsap.utils.random(1.4, 1.8),
    ease: "power3.out"
  }, index * 1.1);
});

tl.to(title, {
  opacity: 1,
  y: 0,
  duration: 0.9,
  ease: "power2.out"
}, "+=0.2");