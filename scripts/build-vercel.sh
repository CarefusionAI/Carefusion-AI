#!/usr/bin/env bash
# Assembles a single Vercel project: the built web app (static, public/) plus the NestJS API as one
# serverless function (api/index.js) that serves /api/*. Output goes to .vercel-deploy/ (git-ignored).
# Usage: scripts/build-vercel.sh            then:  cd .vercel-deploy && vercel deploy --prod
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/.vercel-deploy}"
cd "$ROOT"

pnpm --filter @carefusion/shared build
pnpm --filter @carefusion/api build
pnpm --filter @carefusion/web build

mkdir -p "$OUT"
find "$OUT" -mindepth 1 -maxdepth 1 ! -name .vercel -exec rm -rf {} +
mkdir -p "$OUT/public" "$OUT/api" "$OUT/shared"
cp -R apps/web/dist/. "$OUT/public/"
cp -R apps/api/dist "$OUT/dist"
# The API is CommonJS and the Vercel runtime cannot require() ES modules, so vendor a CommonJS build of shared.
pnpm --filter @carefusion/shared exec tsc --module commonjs --moduleResolution node10 --outDir "$OUT/shared/dist" --declaration false --incremental false
node -e '
const p = require("./packages/shared/package.json");
delete p.type; delete p.scripts; delete p.devDependencies;
require("fs").writeFileSync(process.argv[1] + "/shared/package.json", JSON.stringify(p, null, 2));
' "$OUT"

# Runtime dependencies of the API; the shared workspace package is vendored next to it.
node -e '
const api = require("./apps/api/package.json");
const deps = { ...api.dependencies };
delete deps["@prisma/client"];
// The Vercel runtime cannot require() ES modules; jwks-rsa 4 pulls an ESM-only jose, 3.x does not.
deps["jwks-rsa"] = "3.2.0";
deps["@carefusion/shared"] = "file:./shared";
require("fs").writeFileSync(process.argv[1] + "/package.json", JSON.stringify({
  name: "carefusion-vercel", private: true, version: "0.0.0", dependencies: deps, engines: { node: "22.x" }
}, null, 2));
' "$OUT"

cat > "$OUT/api/index.js" <<'EOF'
// Vercel function: all /api/* requests are handled by the Nest app (see apps/api/src/serverless.ts).
const { createApp } = require('../dist/serverless.js')
let ready
module.exports = async (req, res) => {
  ready = ready || createApp()
  const app = await ready
  return app(req, res)
}
EOF

cat > "$OUT/vercel.json" <<'EOF'
{
  "regions": ["sin1"],
  "functions": { "api/index.js": { "maxDuration": 30, "includeFiles": "dist/**" } },
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Content-Security-Policy", "value": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://*.r2.cloudflarestorage.com; connect-src 'self' https://*.r2.cloudflarestorage.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=(self), payment=()" }
      ]
    }
  ],
  "rewrites": [
    { "source": "/health", "destination": "/api/index" },
    { "source": "/api/(.*)", "destination": "/api/index" },
    { "source": "/((?!api/).*)", "destination": "/index.html" }
  ]
}
EOF

echo "Built $OUT"
