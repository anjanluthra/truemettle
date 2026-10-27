// Bundled into public/vendor/blob-upload.js with esbuild; see the README (deck uploads).
import { uploadPresigned } from '@vercel/blob/client';
window.TMBlobUpload = { upload: uploadPresigned };
