import { config } from './config.js';

/* Decks live in Vercel Blob under decks/. The store can be public or private;
   a private one (what this project uses) serves files only to someone holding
   the store's token, so links to them go through the password-protected admin
   page instead of straight to Blob. */

const DECK_URL = /^https:\/\/[a-z0-9-]+\.(?:(public|private)\.)?blob\.vercel-storage\.com\/decks\/[^?#]+$/i;

/** The uploaded deck's URL if it is one of ours, else ''. */
export const cleanDeckUrl = (value) => {
  const url = String(value ?? '').trim();
  return DECK_URL.test(url) && url.length <= 600 ? url : '';
};

export const isPublicDeck = (url) => /\.public\.blob\.vercel-storage\.com\//i.test(url);

/** Where a person should click to read the deck. */
export const deckLink = (url, base = config.siteUrl) =>
  !url || isPublicDeck(url) ? url : `${base}/admin?deck=${encodeURIComponent(url)}`;
