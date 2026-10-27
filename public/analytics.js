/* Google Analytics 4 (G-P4R91FQN2T). The gtag.js loader is in <head>; this is
   the setup it expects, kept in a file because the CSP allows no inline script.

   Visitors in the EEA, UK and Switzerland are measured without cookies
   (consent mode: analytics_storage denied), so no banner is needed there;
   everywhere else GA works as normal. See the cookie policy. */
window.dataLayer = window.dataLayer || [];
function gtag() { window.dataLayer.push(arguments); }

gtag('consent', 'default', {
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  analytics_storage: 'denied',
  region: [
    'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE',
    'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
    'IS', 'LI', 'NO', 'GB', 'CH'
  ]
});
gtag('consent', 'default', {
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  analytics_storage: 'granted'
});

gtag('js', new Date());
gtag('config', 'G-P4R91FQN2T');
