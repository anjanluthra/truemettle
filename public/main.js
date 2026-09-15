/* True Mettle — progressive enhancement only.
   The page reads and the form posts perfectly well without any of this. */
(function () {
  'use strict';

  /* ── A subtle fade as sections arrive. Nothing else moves. ─────────────── */
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if ('IntersectionObserver' in window && !reduced) {
    var targets = document.querySelectorAll(
      '.hero__type, .hero__plate, .section .measure, .criteria__item, .position, .contact__intro, .form'
    );
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });

    Array.prototype.forEach.call(targets, function (el, i) {
      // Anything already on screen at load stays put — no fade-in flash.
      if (el.getBoundingClientRect().top < window.innerHeight * 0.9) return;
      el.classList.add('reveal');
      el.style.transitionDelay = (i % 5) * 60 + 'ms';
      observer.observe(el);
    });
  }

  /* ── Contact form ─────────────────────────────────────────────────────── */
  var form = document.getElementById('contact-form');
  if (!form) return;

  var button = document.getElementById('submit-button');
  var summary = document.getElementById('form-summary');
  var sent = document.getElementById('sent-panel');
  var startedAt = document.getElementById('f-started');

  // A bot filling the form in under two seconds is not a founder.
  if (startedAt) startedAt.value = String(Date.now());

  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function errorNode(field) {
    return form.querySelector('[data-error-for="' + field + '"]');
  }

  function clearErrors() {
    if (summary) { summary.hidden = true; summary.textContent = ''; }
    Array.prototype.forEach.call(form.querySelectorAll('[data-error-for]'), function (node) {
      node.textContent = '';
    });
    Array.prototype.forEach.call(form.querySelectorAll('[aria-invalid]'), function (input) {
      input.removeAttribute('aria-invalid');
    });
  }

  function showErrors(errors) {
    var first = null;
    Object.keys(errors).forEach(function (field) {
      var node = errorNode(field);
      var input = form.elements[field];
      if (node) node.textContent = errors[field];
      if (input && input.setAttribute) {
        input.setAttribute('aria-invalid', 'true');
        if (!first) first = input;
      }
    });
    if (first) first.focus();
  }

  function validate(values) {
    var errors = {};
    if (!values.name) errors.name = 'Please tell me your name.';
    if (!values.email) errors.email = 'I need an email address to reply to.';
    else if (!EMAIL.test(values.email)) errors.email = 'That email address doesn’t look right.';
    if (!values.situation) errors.situation = 'A line or two about the situation, please.';
    return errors;
  }

  form.addEventListener('submit', function (event) {
    if (!window.fetch || !window.FormData) return; // let the browser post it

    event.preventDefault();
    clearErrors();

    var data = new FormData(form);
    var values = {};
    data.forEach(function (value, key) {
      values[key] = typeof value === 'string' ? value.trim() : value;
    });

    var errors = validate(values);
    if (Object.keys(errors).length) {
      showErrors(errors);
      return;
    }

    button.disabled = true;
    var label = button.textContent;
    button.textContent = 'Sending…';

    fetch(form.action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(values)
    })
      .then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (body) {
          return { ok: response.ok, status: response.status, body: body };
        });
      })
      .then(function (result) {
        if (result.ok && result.body.ok) {
          form.hidden = true;
          sent.hidden = false;
          sent.focus();
          return;
        }
        // Nothing is cleared on failure — whatever they wrote is still there.
        if (result.body && result.body.errors) {
          showErrors(result.body.errors);
          return;
        }
        throw new Error('rejected');
      })
      .catch(function () {
        summary.hidden = false;
        summary.textContent =
          'Something went wrong sending that — nothing has been lost, please try again. ' +
          'If it keeps failing, email me directly.';
      })
      .then(function () {
        button.disabled = false;
        button.textContent = label;
      });
  });
})();
