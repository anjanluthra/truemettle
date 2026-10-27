/* The /admin sign-in page: the photo carousel and the Show/Hide toggle. */
(function () {
  var slides = document.querySelectorAll('.login__slide');
  var dots = document.querySelectorAll('.login__dots span');
  var current = 0;
  var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (slides.length > 1 && !still) {
    setInterval(function () {
      slides[current].classList.remove('is-active');
      if (dots[current]) dots[current].classList.remove('is-active');
      current = (current + 1) % slides.length;
      slides[current].classList.add('is-active');
      if (dots[current]) dots[current].classList.add('is-active');
    }, 6000);
  }

  var input = document.getElementById('password');
  var toggle = document.querySelector('.login__show');
  if (input && toggle) {
    toggle.hidden = false;
    toggle.addEventListener('click', function () {
      var showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      toggle.textContent = showing ? 'Show' : 'Hide';
      toggle.setAttribute('aria-pressed', String(!showing));
      input.focus();
    });
  }

  var form = document.querySelector('.login__form');
  if (form) form.addEventListener('submit', function () {
    form.querySelector('.login__submit').disabled = true;
  });
})();
