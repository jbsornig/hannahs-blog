// Mobile nav toggle
document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', () => links.classList.toggle('open'));
  }
});

// Lightbox gallery
var galleryImages = [];
var galleryIndex = 0;

function openLightbox(src) {
  var items = document.querySelectorAll('.gallery-item img');
  galleryImages = Array.from(items).map(function(img) { return img.src; });
  galleryIndex = galleryImages.indexOf(src);
  if (galleryIndex === -1) galleryIndex = 0;
  showGalleryImage();
  document.getElementById('lightbox').classList.add('active');
}

function showGalleryImage() {
  document.getElementById('lightbox-img').src = galleryImages[galleryIndex];
  var counter = document.getElementById('lightbox-counter');
  if (counter && galleryImages.length > 1) {
    counter.textContent = (galleryIndex + 1) + ' / ' + galleryImages.length;
  }
}

function nextImage() {
  if (galleryImages.length <= 1) return;
  galleryIndex = (galleryIndex + 1) % galleryImages.length;
  showGalleryImage();
}

function prevImage() {
  if (galleryImages.length <= 1) return;
  galleryIndex = (galleryIndex - 1 + galleryImages.length) % galleryImages.length;
  showGalleryImage();
}

function closeLightbox() {
  document.getElementById('lightbox').classList.remove('active');
}

document.addEventListener('keydown', function(e) {
  var lb = document.getElementById('lightbox');
  if (!lb || !lb.classList.contains('active')) return;
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowRight') nextImage();
  if (e.key === 'ArrowLeft') prevImage();
});

// Touch swipe for lightbox
(function() {
  var startX = 0;
  var lb = document.getElementById('lightbox');
  if (!lb) return;
  lb.addEventListener('touchstart', function(e) {
    startX = e.touches[0].clientX;
  });
  lb.addEventListener('touchend', function(e) {
    var diff = e.changedTouches[0].clientX - startX;
    if (Math.abs(diff) > 50) {
      if (diff < 0) nextImage();
      else prevImage();
    }
  });
})();
