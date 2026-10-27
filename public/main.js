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

  /* ── "Send your deck" flow ───────────────────────────────────────────────
     Without JavaScript the flow is a section at the foot of the page with
     every step showing, and both forms post normally. Here it becomes a
     dialog: "Where do you want to start?", then one step at a time. */
  var flow = document.getElementById('contact');
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  if (flow && typeof HTMLDialogElement === 'function') {
    var dialog = document.createElement('dialog');
    dialog.className = 'deck-dialog';
    dialog.setAttribute('aria-label', 'Get in touch');

    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'deck-dialog__close';
    close.setAttribute('aria-label', 'Close');
    close.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 2l12 12M14 2 2 14"/></svg>';
    close.addEventListener('click', function () { dialog.close(); });

    flow.parentNode.insertBefore(dialog, flow);
    dialog.appendChild(close);
    dialog.appendChild(flow);

    var screens = flow.querySelectorAll('[data-screen]');
    var forms = flow.querySelectorAll('.flow__form');

    var showScreen = function (name) {
      Array.prototype.forEach.call(screens, function (screen) {
        screen.hidden = screen.getAttribute('data-screen') !== name;
      });
      dialog.scrollTop = 0;
    };

    var stepsOf = function (form) { return form.querySelectorAll('.flow__step'); };

    var showStep = function (form, index) {
      Array.prototype.forEach.call(stepsOf(form), function (step, i) { step.hidden = i !== index; });
      form.setAttribute('data-current', String(index));
      dialog.scrollTop = 0;
      var first = stepsOf(form)[index].querySelector('input:not([type=hidden]):not([tabindex="-1"]), textarea');
      if (first) first.focus({ preventScroll: true });
    };

    var errorNode = function (form, name) { return form.querySelector('[data-error-for="' + name + '"]'); };

    var clearErrors = function (scope) {
      Array.prototype.forEach.call(scope.querySelectorAll('[data-error-for]'), function (n) { n.textContent = ''; });
      Array.prototype.forEach.call(scope.querySelectorAll('[aria-invalid]'), function (n) { n.removeAttribute('aria-invalid'); });
      var summary = scope.querySelector('.form__summary');
      if (summary) { summary.hidden = true; summary.textContent = ''; }
    };

    var setError = function (form, name, message) {
      var node = errorNode(form, name);
      if (node) node.textContent = message;
      var field = form.elements[name];
      if (field && field.setAttribute) field.setAttribute('aria-invalid', 'true');
    };

    var hasDeck = function (form) {
      var file = form.querySelector('[data-deck-file]');
      return Boolean(file && file.files && file.files.length);
    };

    // Check the fields of one step; returns the first field that failed.
    var checkStep = function (form, step) {
      clearErrors(step);
      var firstBad = null;
      var fail = function (name, message, el) { setError(form, name, message); if (!firstBad) firstBad = el; };

      Array.prototype.forEach.call(step.querySelectorAll('input[required], textarea[required]'), function (field) {
        var value = field.value.trim();
        if (field.name === 'situation' && hasDeck(form)) return;
        if (!value) fail(field.name, field.name === 'situation' ? 'Upload your deck, or tell us in a few lines.' : 'Please fill this in.', field);
        else if (field.type === 'email' && !EMAIL.test(value)) fail(field.name, 'That email address doesn’t look right.', field);
      });
      Array.prototype.forEach.call(step.querySelectorAll('[data-required-group]'), function (group) {
        var boxes = group.querySelectorAll('input');
        var ticked = Array.prototype.some.call(boxes, function (box) { return box.checked; });
        if (!ticked) fail(boxes[0].name, 'Please choose one.', boxes[0]);
      });
      var file = step.querySelector('[data-deck-file]');
      if (file && file.files && file.files[0]) {
        var f = file.files[0];
        if (!/\.pdf$/i.test(f.name)) fail('deck', 'Please upload a PDF.', file);
        else if (f.size > 20 * 1024 * 1024) fail('deck', 'That file is over 20MB.', file);
      }
      return firstBad;
    };

    var values = function (form) {
      var out = {};
      new FormData(form).forEach(function (value, key) {
        if (typeof value !== 'string') return;           // the file input
        value = value.trim();
        if (key === 'sector') (out[key] = out[key] || []).push(value);
        else out[key] = value;
      });
      return out;
    };

    // Deck uploads go straight from the browser to Vercel Blob (a function
    // can't take 20MB). The uploader loads only when someone gets this far.
    var uploadsEnabled = null;
    var checkUploads = function () {
      if (uploadsEnabled !== null || !window.fetch) return;
      uploadsEnabled = false;
      fetch('/api/deck-upload', { headers: { Accept: 'application/json' } })
        .then(function (r) { return r.ok ? r.json() : {}; })
        .then(function (body) {
          uploadsEnabled = Boolean(body && body.enabled);
          if (!uploadsEnabled) return;
          Array.prototype.forEach.call(flow.querySelectorAll('[data-upload]'), function (box) { box.hidden = false; });
        })
        .catch(function () {});
    };

    var loadUploader = function () {
      if (window.TMBlobUpload) return Promise.resolve(window.TMBlobUpload);
      return new Promise(function (resolve, reject) {
        var script = document.createElement('script');
        script.src = '/vendor/blob-upload.js';
        script.onload = function () { resolve(window.TMBlobUpload); };
        script.onerror = reject;
        document.head.appendChild(script);
      });
    };

    var uploadDeck = function (form) {
      var input = form.querySelector('[data-deck-file]');
      var target = form.querySelector('[data-deck-url]');
      if (!input || !input.files || !input.files[0] || !uploadsEnabled) return Promise.resolve();
      if (target.value) return Promise.resolve();
      var file = input.files[0];
      var safe = file.name.replace(/[^\w.\-]+/g, '-').slice(-80);
      return loadUploader().then(function (blob) {
        return blob.upload('decks/' + safe, file, { access: 'private', handleUploadUrl: '/api/deck-upload' });
      }).then(function (result) { target.value = result.url; });
    };

    Array.prototype.forEach.call(flow.querySelectorAll('[data-deck-file]'), function (input) {
      input.addEventListener('change', function () {
        var form = input.form;
        form.querySelector('[data-deck-url]').value = '';
        form.querySelector('[data-deck-name]').textContent = input.files[0] ? input.files[0].name : '';
        clearErrors(input.closest('.flow__step'));
      });
    });

    Array.prototype.forEach.call(forms, function (form) {
      showStep(form, 0);

      form.addEventListener('click', function (event) {
        var next = event.target.closest('[data-next]');
        var back = event.target.closest('[data-back]');
        var index = Number(form.getAttribute('data-current'));
        if (next) {
          var bad = checkStep(form, stepsOf(form)[index]);
          if (bad) { bad.focus(); return; }
          showStep(form, index + 1);
          if (index + 1 === stepsOf(form).length - 1) checkUploads();
        }
        if (back) showStep(form, index - 1);
      });

      form.addEventListener('submit', function (event) {
        if (!window.fetch || !window.FormData) return; // let the browser post it
        event.preventDefault();
        var steps = stepsOf(form);
        var last = steps[steps.length - 1];
        var bad = checkStep(form, last);
        if (bad) { bad.focus(); return; }

        var button = form.querySelector('.flow__send');
        var label = button.innerHTML;
        button.disabled = true;
        button.textContent = hasDeck(form) && uploadsEnabled ? 'Uploading…' : 'Sending…';
        var summary = last.querySelector('.form__summary');

        uploadDeck(form)
          .then(function () {
            button.textContent = 'Sending…';
            return fetch(form.action, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
              body: JSON.stringify(values(form))
            });
          })
          .then(function (response) {
            return response.json().catch(function () { return {}; }).then(function (body) {
              return { ok: response.ok, body: body };
            });
          })
          .then(function (result) {
            if (result.ok && result.body.ok) {
              showScreen(form.getAttribute('data-kind') + '-done');
              flow.querySelector('[data-screen="' + form.getAttribute('data-kind') + '-done"]').focus();
              return;
            }
            // Server-side errors: show them, on the step that holds the field.
            if (result.body && result.body.errors) {
              var firstStep = null;
              Object.keys(result.body.errors).forEach(function (name) {
                setError(form, name, result.body.errors[name]);
                var node = errorNode(form, name);
                var step = node && node.closest('.flow__step');
                var i = Array.prototype.indexOf.call(steps, step);
                if (i >= 0 && (firstStep === null || i < firstStep)) firstStep = i;
              });
              if (firstStep !== null && firstStep !== steps.length - 1) showStep(form, firstStep);
              return;
            }
            throw new Error((result.body && result.body.message) || 'rejected');
          })
          .catch(function (error) {
            summary.hidden = false;
            summary.textContent = (error && error.message && error.message !== 'rejected' && error.message.length < 160)
              ? error.message
              : 'Something went wrong sending that. Nothing has been lost — please try again, or email anjan@joindeployed.com.';
          })
          .then(function () {
            button.disabled = false;
            button.innerHTML = label;
          });
      });
    });

    Array.prototype.forEach.call(flow.querySelectorAll('[data-route]'), function (link) {
      link.addEventListener('click', function (event) {
        event.preventDefault();
        var name = link.getAttribute('data-route');
        showScreen(name);
        var form = flow.querySelector('.flow__form[data-kind="' + name + '"]');
        showStep(form, 0);
      });
    });

    var open = function (event) {
      if (event) event.preventDefault();
      if (dialog.open) return;
      showScreen('start');
      Array.prototype.forEach.call(flow.querySelectorAll('[data-started]'), function (n) { n.value = String(Date.now()); });
      dialog.showModal();
      document.documentElement.classList.add('is-deck-open');
      var first = flow.querySelector('[data-screen="start"] .route');
      if (first) first.focus({ preventScroll: true });
    };

    // A click on the backdrop lands on the dialog element itself.
    dialog.addEventListener('click', function (event) {
      if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener('close', function () {
      document.documentElement.classList.remove('is-deck-open');
      // After a thank-you, start afresh next time; otherwise keep their place.
      var done = flow.querySelector('.flow__screen--done:not([hidden])');
      if (done) {
        Array.prototype.forEach.call(forms, function (form) {
          form.reset();
          clearErrors(form);
          Array.prototype.forEach.call(form.querySelectorAll('[data-deck-name]'), function (n) { n.textContent = ''; });
          showStep(form, 0);
        });
      }
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-open-deck]'), function (link) {
      link.addEventListener('click', open);
    });
    if (location.hash === '#contact') open();
  }

  /* ── Privacy and cookie policies: each a popup from the footer ──────────── */
  if (typeof HTMLDialogElement === 'function') {
    var policies = {};
    Array.prototype.forEach.call(document.querySelectorAll('.policy'), function (policy) {
      var box = document.createElement('dialog');
      box.className = 'deck-dialog policy-dialog';
      box.setAttribute('aria-labelledby', policy.getAttribute('aria-labelledby'));
      var shut = document.createElement('button');
      shut.type = 'button';
      shut.className = 'deck-dialog__close';
      shut.setAttribute('aria-label', 'Close');
      shut.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 2l12 12M14 2 2 14"/></svg>';
      shut.addEventListener('click', function () { box.close(); });
      box.addEventListener('click', function (event) { if (event.target === box) box.close(); });
      box.addEventListener('close', function () { document.documentElement.classList.remove('is-deck-open'); });
      box.appendChild(shut);
      box.appendChild(policy);
      document.body.appendChild(box);
      policies[policy.id] = box;
    });
    var holder = document.querySelector('.policies');
    if (holder) holder.parentNode.removeChild(holder);

    var openPolicy = function (id) {
      var box = policies[id];
      if (!box || box.open) return false;
      box.showModal();
      box.scrollTop = 0;
      document.documentElement.classList.add('is-deck-open');
      return true;
    };
    Array.prototype.forEach.call(document.querySelectorAll('[data-policy]'), function (link) {
      link.addEventListener('click', function (event) {
        if (openPolicy(link.getAttribute('href').slice(1))) event.preventDefault();
      });
    });
    if (location.hash) openPolicy(location.hash.slice(1));
  }

  /* ── Header: solid once the hero has gone; the mark goes back to the top ── */
  var topbar = document.querySelector('.topbar');
  var hero = document.querySelector('.hero');
  if (topbar && hero && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      topbar.classList.toggle('is-solid', !entries[0].isIntersecting);
    }, { rootMargin: '-' + topbar.offsetHeight + 'px 0px 0px 0px' }).observe(hero);
  } else if (topbar) {
    topbar.classList.add('is-solid');
  }
  var mark = document.querySelector('.topbar__mark');
  if (mark) {
    mark.addEventListener('click', function (event) {
      event.preventDefault();
      // Jump (not glide) to the top first, so the reload doesn't restore the old position.
      window.scrollTo({ top: 0, behavior: 'instant' });
      if (location.pathname === '/' && !location.hash && !location.search) location.reload();
      else location.assign('/');
    });
  }

  /* ── Cookie banner: ask before analytics cookies (see /analytics.js) ────── */
  var COOKIE_KEY = 'tm-cookies';
  var readChoice = function () { try { return localStorage.getItem(COOKIE_KEY); } catch (e) { return null; } };
  var banner = document.createElement('section');
  banner.className = 'cookie-banner';
  banner.setAttribute('aria-label', 'Cookies');
  banner.hidden = true;
  banner.innerHTML =
    '<p class="cookie-banner__title">Cookies</p>' +
    '<p class="cookie-banner__text">We’d like to use Google Analytics cookies to see how people find and use this site. No advertising. ' +
    '<a href="#cookies">Cookie policy</a></p>' +
    '<div class="cookie-banner__actions">' +
    '<button type="button" class="cookie-banner__decline" data-choice="denied">Decline</button>' +
    '<button type="button" class="cta cta--button" data-choice="granted">Accept<svg class="cta__arrow" viewBox="0 0 16 16" aria-hidden="true"><path d="M1 8h13M9 3l5 5-5 5"/></svg></button>' +
    '</div>';
  document.body.appendChild(banner);

  var showBanner = function () { banner.hidden = false; };
  Array.prototype.forEach.call(banner.querySelectorAll('[data-choice]'), function (button) {
    button.addEventListener('click', function () {
      var choice = button.getAttribute('data-choice');
      try { localStorage.setItem(COOKIE_KEY, choice); } catch (e) { /* private mode: ask again next time */ }
      if (typeof window.gtag === 'function') window.gtag('consent', 'update', { analytics_storage: choice });
      banner.hidden = true;
    });
  });
  banner.querySelector('a[href="#cookies"]').addEventListener('click', function (event) {
    var policyLink = document.querySelector('[data-policy][href="#cookies"]');
    if (policyLink) { event.preventDefault(); policyLink.click(); }
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-cookie-settings]'), function (link) {
    link.addEventListener('click', function (event) {
      event.preventDefault();
      // From inside the cookie policy popup: close it so the banner isn't behind it.
      var popup = link.closest('dialog');
      if (popup && popup.open) popup.close();
      showBanner();
      banner.querySelector('[data-choice="granted"]').focus();
    });
  });
  if (!readChoice()) showBanner();

  /* ── Sideways rows (sectors, process): arrows that step them ────────────── */
  Array.prototype.forEach.call(document.querySelectorAll('[data-row-nav]'), function (nav) {
    var row = document.querySelector('[data-row="' + nav.getAttribute('data-row-nav') + '"]');
    if (!row) return;
    var arrows = nav.querySelectorAll('.row-arrow');
    var sync = function () {
      var max = row.scrollWidth - row.clientWidth - 2;
      arrows[0].disabled = row.scrollLeft <= 2;
      arrows[1].disabled = row.scrollLeft >= max;
      nav.hidden = max <= 0;
    };
    Array.prototype.forEach.call(arrows, function (button) {
      button.addEventListener('click', function () {
        var item = row.firstElementChild;
        var gap = parseFloat(getComputedStyle(row).columnGap) || 0;
        row.scrollBy({ left: Number(button.dataset.dir) * (item ? item.offsetWidth + gap : 300), behavior: 'smooth' });
      });
    });
    row.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    sync();
  });

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

})();
