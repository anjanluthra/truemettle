/* Google Analytics 4 (G-P4R91FQN2T). The gtag.js loader is in <head>; this is
   the setup it expects, kept in a file because the CSP allows no inline script.

   Consent first: no analytics cookies until the visitor accepts in the cookie
   banner (main.js). Until then, or after "Decline", Google counts the visit
   without cookies. Advertising storage is never used. The choice is kept in
   localStorage under "tm-cookies" ("granted" or "denied"). */
window.dataLayer = window.dataLayer || [];
function gtag() { window.dataLayer.push(arguments); }

var tmCookieChoice = null;
try { tmCookieChoice = window.localStorage.getItem('tm-cookies'); } catch (e) { /* private mode */ }

gtag('consent', 'default', {
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  analytics_storage: tmCookieChoice === 'granted' ? 'granted' : 'denied'
});

gtag('js', new Date());
gtag('config', 'G-P4R91FQN2T');
