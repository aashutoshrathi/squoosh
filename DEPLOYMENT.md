# Deployment Guide

This guide explains how to build and deploy Squoosh as a static site.

## Build

Squoosh is a static app. Build it with npm:

```sh
npm ci
npm run build
```

Build output goes to `build`. Deploy the contents of that folder. Do not deploy the repo root.

To preview the build locally with required headers and routing:

```sh
npx serve --listen 8000 --config serve.json build
```

Then open `http://localhost:8000` in your browser. Alternatively, run `npm run dev` to watch and serve development builds.

## Required Headers

Squoosh uses WebAssembly with multithreading and SharedArrayBuffer. Browsers only enable these features in a cross-origin isolated context. You must serve the app with these two headers on all responses:

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Without these headers, the app may load but codecs that need SharedArrayBuffer will fail or fall back to slow paths. Check the headers in your browser devtools under Network, then Response Headers.

If you load cross-origin resources such as fonts or analytics, make sure those responses allow CORP or CORS, or self-host them. Otherwise `require-corp` will block them.

## GitHub Pages

This repo ships with `.github/workflows/deploy.yml`. It builds on every push to `dev` or `main` and deploys `build` to GitHub Pages.

Setup steps:

1. Go to repo Settings, then Pages.
2. Under Build and deployment, set Source to GitHub Actions.
3. Push to `dev` or `main`. The Deploy job publishes the site.

The workflow uses `actions/configure-pages@v5` to set `PUBLIC_PATH` automatically. It supports root domains, custom domains, and repository subpaths such as `https://<username>.github.io/<repo-name>/`.

The service worker adds Cross-Origin-Embedder-Policy and Cross-Origin-Opener-Policy headers on document navigation requests. The application reloads automatically on first installation to activate cross-origin isolation for WebAssembly threads.

## Cloudflare Pages

Cloudflare Pages can build and host Squoosh directly.

1. Connect your repo in the Cloudflare dashboard.
2. Set Build command to `npm run build`.
3. Set Build output directory to `build`.
4. Set Node version to 22 in the environment settings.

The build process automatically generates `build/_headers` with the required COOP and COEP settings. Any additional static files can be placed in `src/copy/`.

Verify the headers after deployment with `curl -I` on your Pages URL.

## Vercel

This repo ships with `vercel.json`. It sets the output directory to `build` and adds COOP and COEP headers for all routes.

Deploy steps:

1. Import the repo in Vercel.
2. Keep the Build Command as `npm run build`. Vercel picks up the output directory and headers from `vercel.json`.
3. Deploy.

To verify, open the deployment URL and check Response Headers for `cross-origin-opener-policy` and `cross-origin-embedder-policy`.

## Netlify

This repo ships with `netlify.toml`. It sets publish to `build`, build command to `npm run build`, and adds COOP and COEP headers for all routes.

Deploy steps:

1. Import the repo in Netlify.
2. Netlify reads `netlify.toml` and fills in the build settings for you.
3. Deploy.

To verify, open the deployment URL and check Response Headers for COOP and COEP.

## Self-Hosted Nginx

Serve `build` as static files and add the headers on all responses.

Example server block:

```nginx
server {
  listen 443 ssl;
  server_name example.com;

  root /var/www/squoosh/build;
  index index.html;

  add_header Cross-Origin-Opener-Policy "same-origin" always;
  add_header Cross-Origin-Embedder-Policy "require-corp" always;

  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

Reload Nginx after the change:

```sh
nginx -t && nginx -s reload
```

Verify with:

```sh
curl -I https://example.com/
```

You should see both headers in the output.

## Self-Hosted Caddy

Caddy serves static files with automatic HTTPS. Point `root` at the build output and set the headers.

Example Caddyfile:

```caddy
example.com {
  root * /var/www/squoosh/build
  file_server
  try_files {path} {path}/ /index.html

  header {
    Cross-Origin-Opener-Policy same-origin
    Cross-Origin-Embedder-Policy require-corp
  }
}
```

Reload with:

```sh
caddy fmt --overwrite
caddy reload
```

Verify with:

```sh
curl -I https://example.com/
```

## Troubleshooting

- Headers missing: confirm your host serves custom headers on every route, including `index.html` and cached assets.
- SharedArrayBuffer is not defined: this means COOP and COEP are not both active. Fix headers, hard reload, and retest.
- Blank page after deploy: verify you deployed `build` and not the repo root, and that `index.html` loads with status 200.
- Stale codecs after update: clear the CDN or proxy cache when you ship a new build, since WASM files may carry long cache times.
