/* True Mettle — progressive enhancement only.
   The page reads and the form posts perfectly well without any of this. */
(function () {
  'use strict';

  /* ── A subtle fade as sections arrive. Nothing else moves. ─────────────── */
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if ('IntersectionObserver' in window && !reduced) {
    var targets = document.querySelectorAll(
      '.mission__text, .statement, .stat, .quote__text, .formula__item, .sectors .display, .sector, .point, .step, .closing__text, .faq'
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

  /* ── Year in the footer ───────────────────────────────────────────────── */
  Array.prototype.forEach.call(document.querySelectorAll('.js-year'), function (node) {
    node.textContent = String(new Date().getFullYear());
  });

  /* ── "Send your deck" opens the form in a dialog ──────────────────────────
     Without JavaScript the form is a section at the foot of the page and the
     links simply jump to it. */
  var deck = document.getElementById('contact');
  if (deck && typeof HTMLDialogElement === 'function') {
    var dialog = document.createElement('dialog');
    dialog.className = 'deck-dialog';
    dialog.setAttribute('aria-labelledby', 'contact-heading');

    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'deck-dialog__close';
    close.setAttribute('aria-label', 'Close');
    close.textContent = '×';
    close.addEventListener('click', function () { dialog.close(); });

    deck.parentNode.insertBefore(dialog, deck);
    dialog.appendChild(close);
    dialog.appendChild(deck);

    // A click on the backdrop lands on the dialog element itself.
    dialog.addEventListener('click', function (event) {
      if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener('close', function () {
      document.documentElement.classList.remove('is-deck-open');
    });

    var open = function (event) {
      if (event) event.preventDefault();
      if (dialog.open) return;
      dialog.showModal();
      document.documentElement.classList.add('is-deck-open');
      var first = dialog.querySelector('input:not([type=hidden]):not([tabindex="-1"])');
      if (first && !document.getElementById('contact-form').hidden) first.focus();
    };

    Array.prototype.forEach.call(document.querySelectorAll('[data-open-deck]'), function (link) {
      link.addEventListener('click', open);
    });
    if (location.hash === '#contact') open();
  }

  /* ── Process: arrows that step the row sideways ───────────────────────── */
  var steps = document.querySelector('.process__steps');
  var nav = document.querySelector('.process__nav');
  if (steps && nav) {
    var arrows = nav.querySelectorAll('.process__arrow');
    var sync = function () {
      var max = steps.scrollWidth - steps.clientWidth - 2;
      arrows[0].disabled = steps.scrollLeft <= 2;
      arrows[1].disabled = steps.scrollLeft >= max;
      nav.hidden = max <= 0;
    };
    Array.prototype.forEach.call(arrows, function (button) {
      button.addEventListener('click', function () {
        var step = steps.querySelector('.step');
        steps.scrollBy({ left: Number(button.dataset.dir) * (step ? step.offsetWidth : 300), behavior: 'smooth' });
      });
    });
    steps.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    sync();
  }

  /* ── Newsletter sign-up ───────────────────────────────────────────────── */
  var subscribe = document.getElementById('subscribe-form');
  if (subscribe && window.fetch && window.FormData) {
    var status = document.getElementById('subscribe-status');
    var subscribeButton = subscribe.querySelector('button');
    var SIMPLE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

    subscribe.addEventListener('submit', function (event) {
      event.preventDefault();
      var values = {};
      new FormData(subscribe).forEach(function (value, key) { values[key] = String(value).trim(); });

      if (!SIMPLE_EMAIL.test(values.email || '')) {
        status.textContent = 'That email address doesn’t look right.';
        subscribe.elements.email.focus();
        return;
      }

      subscribeButton.disabled = true;
      status.textContent = '';

      fetch(subscribe.action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(values)
      })
        .then(function (response) {
          return response.json().catch(function () { return {}; }).then(function (body) {
            if (response.ok && body.ok) {
              // The design's success state: the field reads "Success!" and
              // the button gives way to the thank-you line.
              subscribe.reset();
              subscribe.elements.email.placeholder = 'Success!';
              subscribe.classList.add('is-done');
              status.textContent = 'Thank you! Your submission has been received!';
              return;
            }
            status.textContent = body.message || 'Something went wrong. Please try again.';
          });
        })
        .catch(function () {
          status.textContent = 'Something went wrong. Please try again.';
        })
        .then(function () { subscribeButton.disabled = false; });
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
    var label = button.innerHTML;
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
          'If it keeps failing, email us directly.';
      })
      .then(function () {
        button.disabled = false;
        button.innerHTML = label;
      });
  });
})();
