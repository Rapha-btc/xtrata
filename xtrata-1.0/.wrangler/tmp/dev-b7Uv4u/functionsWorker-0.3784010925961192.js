var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/pages-hp9vwH/functionsWorker-0.3784010925961192.mjs
var __defProp2 = Object.defineProperty;
var __name2 = /* @__PURE__ */ __name((target, value) => __defProp2(target, "name", { value, configurable: true }), "__name");
function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
__name(jsonResponse, "jsonResponse");
__name2(jsonResponse, "jsonResponse");
function badRequest(message) {
  return jsonResponse({ error: message }, 400);
}
__name(badRequest, "badRequest");
__name2(badRequest, "badRequest");
function notFound(message = "Not found") {
  return jsonResponse({ error: message }, 404);
}
__name(notFound, "notFound");
__name2(notFound, "notFound");
function serverError(message = "Server error") {
  return jsonResponse({ error: message }, 500);
}
__name(serverError, "serverError");
__name2(serverError, "serverError");
async function run(env, query, binds = []) {
  const statement = env.DB.prepare(query);
  if (binds.length > 0) {
    return statement.bind(...binds).run();
  }
  return statement.run();
}
__name(run, "run");
__name2(run, "run");
var slugPattern = /^[a-z0-9-]{3,64}$/;
var normalizeSlug = /* @__PURE__ */ __name2((value) => value.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-"), "normalizeSlug");
var isValidSlug = /* @__PURE__ */ __name2((value) => slugPattern.test(value), "isValidSlug");
var staysWithinLimit = /* @__PURE__ */ __name2((currentBytes, upcomingBytes, limitBytes) => currentBytes + upcomingBytes <= limitBytes, "staysWithinLimit");
var onRequest = /* @__PURE__ */ __name2(async ({ request, env, params }) => {
  const collectionId = params?.collectionId;
  if (!collectionId) {
    return badRequest("Collection id missing.");
  }
  if (request.method === "GET") {
    await run(
      env,
      "UPDATE assets SET state = ? WHERE collection_id = ? AND expires_at IS NOT NULL AND expires_at < ? AND state = ?",
      ["expired", collectionId, Date.now(), "draft"]
    );
    const statement = env.DB.prepare(
      "SELECT * FROM assets WHERE collection_id = ? ORDER BY created_at DESC"
    );
    const result = await statement.bind(collectionId).all();
    return jsonResponse(result.results ?? []);
  }
  if (request.method === "POST") {
    try {
      const payload = await request.json();
      const path = String(payload.path ?? "").trim();
      if (!path) {
        return badRequest("path is required.");
      }
      const storageKey = String(payload.storageKey ?? "").trim();
      if (!storageKey) {
        return badRequest("storageKey is required.");
      }
      const mimeType = String(payload.mimeType ?? "application/octet-stream");
      const totalBytes = Number(payload.totalBytes ?? 0);
      const totalChunks = Number(payload.totalChunks ?? 0);
      const expectedHash = String(payload.expectedHash ?? "");
      const limitBytes = Number(env.MAX_COLLECTION_STORAGE_BYTES ?? 500 * 1024 * 1024);
      const sumStatement = env.DB.prepare(
        "SELECT COALESCE(SUM(total_bytes), 0) as total FROM assets WHERE collection_id = ? AND state != ?"
      );
      const aggregate = await sumStatement.bind(collectionId, "sold-out").all();
      const currentBytes = Number(aggregate.results?.[0]?.total ?? 0);
      if (!staysWithinLimit(currentBytes, totalBytes, limitBytes)) {
        return badRequest(
          `Collection storage limit exceeded. Limit: ${(limitBytes / (1024 * 1024)).toFixed(0)} MB.`
        );
      }
      const ttlMs = Number(env.COLLECTION_ASSET_TTL_MS ?? 3 * 24 * 60 * 60 * 1e3);
      const expiresAt = Date.now() + ttlMs;
      const assetId = crypto.randomUUID();
      await run(
        env,
        `INSERT INTO assets (asset_id, collection_id, path, filename, mime_type, total_bytes, total_chunks, expected_hash, storage_key, edition_cap, state, expires_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          assetId,
          collectionId,
          path,
          payload.filename ?? null,
          mimeType,
          totalBytes,
          totalChunks,
          expectedHash,
          storageKey,
          payload.editionCap ?? null,
          "draft",
          expiresAt,
          Date.now(),
          Date.now()
        ]
      );
      const inserted = await env.DB.prepare("SELECT * FROM assets WHERE asset_id = ?").bind(assetId).all();
      const row = (inserted.results ?? [])[0];
      return jsonResponse(row, 201);
    } catch (error) {
      return serverError(error instanceof Error ? error.message : "Failed to add asset");
    }
  }
  return jsonResponse({ error: "Method not allowed" }, 405);
}, "onRequest");
var parseMetadata = /* @__PURE__ */ __name2((raw) => {
  if (!raw) {
    return null;
  }
  if (typeof raw === "object") {
    return raw;
  }
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return null;
}, "parseMetadata");
var onRequest2 = /* @__PURE__ */ __name2(async ({ request, env, params }) => {
  const collectionId = params?.collectionId;
  if (!collectionId) {
    return badRequest("Collection id missing.");
  }
  if (request.method === "POST") {
    try {
      const payload = await request.json();
      const target = payload.state === "published" ? "published" : "draft";
      if (target === "published") {
        const collectionResult = await env.DB.prepare("SELECT * FROM collections WHERE id = ?").bind(collectionId).all();
        const collection = (collectionResult.results ?? [])[0];
        if (!collection) {
          return badRequest("Collection not found.");
        }
        const contractAddress = String(collection.contract_address ?? "").trim();
        if (!contractAddress) {
          return badRequest("Deploy the collection contract before publishing.");
        }
        const metadata = parseMetadata(collection.metadata);
        const mintType = typeof metadata?.mintType === "string" ? metadata.mintType : "standard";
        await run(
          env,
          "UPDATE assets SET state = ? WHERE collection_id = ? AND expires_at IS NOT NULL AND expires_at < ? AND state = ?",
          ["expired", collectionId, Date.now(), "draft"]
        );
        const assetsCountResult = await env.DB.prepare(
          "SELECT COUNT(*) as total FROM assets WHERE collection_id = ? AND state NOT IN (?, ?)"
        ).bind(collectionId, "expired", "sold-out").all();
        const activeAssets = Number(assetsCountResult.results?.[0]?.total ?? 0);
        if (mintType !== "pre-inscribed" && activeAssets <= 0) {
          return badRequest(
            "Upload at least one artwork file in Step 2 before publishing."
          );
        }
      }
      await run(
        env,
        "UPDATE collections SET state = ?, updated_at = ? WHERE id = ?",
        [target, Date.now(), collectionId]
      );
      const select = await env.DB.prepare("SELECT * FROM collections WHERE id = ?").bind(collectionId).all();
      const record = (select.results ?? [])[0];
      return jsonResponse(record);
    } catch (error) {
      return serverError(error instanceof Error ? error.message : "Failed to update state");
    }
  }
  return jsonResponse({ error: "Method not allowed" }, 405);
}, "onRequest");
var onRequest3 = /* @__PURE__ */ __name2(async ({ request, env, params }) => {
  const collectionId = params?.collectionId;
  if (!collectionId) {
    return badRequest("Collection id missing.");
  }
  if (request.method === "GET") {
    const statement = env.DB.prepare(
      "SELECT * FROM reservations WHERE collection_id = ? ORDER BY created_at DESC"
    );
    const result = await statement.bind(collectionId).all();
    return jsonResponse(result.results ?? []);
  }
  if (request.method === "POST") {
    try {
      const payload = await request.json();
      if (!payload.assetId || !payload.buyerAddress || !payload.hashHex) {
        return badRequest("assetId, buyerAddress, and hashHex are required.");
      }
      const reservationId = crypto.randomUUID();
      const now = Date.now();
      const expiresAt = now + (payload.durationMs ? Number(payload.durationMs) : 12e5);
      await run(
        env,
        `INSERT INTO reservations (reservation_id, collection_id, asset_id, buyer_address, hash_hex, status, tx_id, expires_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [reservationId, collectionId, payload.assetId, payload.buyerAddress, payload.hashHex, "created", payload.txId ?? null, expiresAt, now, now]
      );
      const inserted = await env.DB.prepare("SELECT * FROM reservations WHERE reservation_id = ?").bind(reservationId).all();
      return jsonResponse(inserted.results?.[0]);
    } catch (error) {
      return serverError(error instanceof Error ? error.message : "Failed to create reservation");
    }
  }
  if (request.method === "PATCH") {
    try {
      const payload = await request.json();
      if (!payload.reservationId || !payload.action) {
        return badRequest("reservationId and action are required.");
      }
      let status = "created";
      if (payload.action === "confirm") {
        status = "confirmed";
      } else if (payload.action === "release") {
        status = "released";
      } else if (payload.action === "cancel") {
        status = "cancelled";
      }
      await run(
        env,
        "UPDATE reservations SET status = ?, tx_id = ?, updated_at = ? WHERE reservation_id = ?",
        [status, payload.txId ?? null, Date.now(), payload.reservationId]
      );
      const select = await env.DB.prepare("SELECT * FROM reservations WHERE reservation_id = ?").bind(payload.reservationId).all();
      return jsonResponse(select.results?.[0]);
    } catch (error) {
      return serverError(error instanceof Error ? error.message : "Failed to update reservation");
    }
  }
  return jsonResponse({ error: "Method not allowed" }, 405);
}, "onRequest");
var onRequest4 = /* @__PURE__ */ __name2(async ({ env, params }) => {
  const collectionId = params?.collectionId;
  if (!collectionId) {
    return new Response(JSON.stringify({ error: "collection id required" }), { status: 400 });
  }
  const key = `${collectionId}/${crypto.randomUUID()}`;
  const uploadUrl = await env.ASSETS.getUploadUrl({ method: "PUT", key, expires: 60 * 5 });
  return new Response(JSON.stringify({ uploadUrl, key }), {
    headers: { "Content-Type": "application/json" }
  });
}, "onRequest");
var getTargetBase = /* @__PURE__ */ __name2((network) => {
  if (network === "mainnet") {
    return "https://api.mainnet.hiro.so";
  }
  if (network === "testnet") {
    return "https://api.testnet.hiro.so";
  }
  return null;
}, "getTargetBase");
var onRequest5 = /* @__PURE__ */ __name2(async (context) => {
  const { request, params, env } = context;
  const network = params.network ?? "";
  const targetBase = getTargetBase(network);
  if (!targetBase) {
    return new Response("Unknown network", { status: 404 });
  }
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "content-type,x-hiro-api-key"
      }
    });
  }
  const url = new URL(request.url);
  const pathParam = params.path;
  const path = Array.isArray(pathParam) ? pathParam.join("/") : pathParam ?? "";
  const targetUrl = `${targetBase}/${path}${url.search}`;
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("origin");
  const apiKey = env.HIRO_API_KEY || env.VITE_HIRO_API_KEY;
  if (apiKey) {
    headers.set("x-hiro-api-key", apiKey);
    headers.set("x-api-key", apiKey);
  }
  const body = request.method === "GET" || request.method === "HEAD" ? void 0 : await request.arrayBuffer();
  const response = await fetch(targetUrl, {
    method: request.method,
    headers,
    body,
    redirect: "follow"
  });
  const responseHeaders = new Headers(response.headers);
  responseHeaders.set("Access-Control-Allow-Origin", "*");
  responseHeaders.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  responseHeaders.set("Access-Control-Allow-Headers", "content-type,x-hiro-api-key");
  return new Response(response.body, {
    status: response.status,
    headers: responseHeaders
  });
}, "onRequest");
var countRows = /* @__PURE__ */ __name2(async (db, table) => {
  const statement = await db.prepare(`SELECT COUNT(*) AS total FROM ${table}`);
  const result = await statement.all();
  return Number(result.results?.[0]?.total ?? 0);
}, "countRows");
var onRequest6 = /* @__PURE__ */ __name2(async ({ env }) => {
  try {
    const collectionsCount = await countRows(env.DB, "collections");
    const assetsCount = await countRows(env.DB, "assets");
    const reservationsCount = await countRows(env.DB, "reservations");
    return jsonResponse({
      collectionsCount,
      assetsCount,
      reservationsCount,
      timestamp: Date.now()
    });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : "Health check failed");
  }
}, "onRequest");
var mapRow = /* @__PURE__ */ __name2((row) => ({
  ...row,
  metadata: row.metadata ? JSON.parse(String(row.metadata)) : null
}), "mapRow");
var onRequest7 = /* @__PURE__ */ __name2(async ({ request, env, params }) => {
  const collectionId = params?.collectionId;
  if (!collectionId) {
    return badRequest("Collection id is required.");
  }
  if (request.method === "GET") {
    const statement = env.DB.prepare("SELECT * FROM collections WHERE id = ?");
    const result = await statement.bind(collectionId).all();
    const record = (result.results ?? [])[0];
    if (!record) {
      return notFound("Collection not found.");
    }
    return jsonResponse(mapRow(record));
  }
  if (request.method === "PATCH") {
    try {
      const payload = await request.json();
      const updates = [];
      const binds = [];
      if (typeof payload.displayName === "string") {
        updates.push("display_name = ?");
        binds.push(payload.displayName.trim());
      }
      if (typeof payload.artistAddress === "string") {
        updates.push("artist_address = ?");
        binds.push(payload.artistAddress.trim());
      }
      if (typeof payload.contractAddress === "string") {
        updates.push("contract_address = ?");
        binds.push(payload.contractAddress.trim());
      }
      if (payload.metadata) {
        updates.push("metadata = ?");
        binds.push(JSON.stringify(payload.metadata));
      }
      if (typeof payload.state === "string") {
        updates.push("state = ?");
        binds.push(payload.state);
      }
      if (updates.length === 0) {
        return badRequest("No updatable fields provided.");
      }
      binds.push(Date.now());
      binds.push(collectionId);
      const query = `UPDATE collections SET ${updates.join(", ")}, updated_at = ? WHERE id = ?`;
      await run(env, query, binds);
      const select = env.DB.prepare("SELECT * FROM collections WHERE id = ?");
      const record = (await select.bind(collectionId).all()).results?.[0];
      if (!record) {
        return notFound("Collection not found after update.");
      }
      return jsonResponse(mapRow(record));
    } catch (error) {
      return serverError(error instanceof Error ? error.message : "failed to update collection");
    }
  }
  return jsonResponse({ error: "Method not allowed" }, 405);
}, "onRequest");
var DEFAULT_BNS_BASE = "https://api.bns.xyz";
var onRequest8 = /* @__PURE__ */ __name2(async (context) => {
  const { request, params, env } = context;
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "content-type"
      }
    });
  }
  const url = new URL(request.url);
  const pathParam = params.path;
  const path = Array.isArray(pathParam) ? pathParam.join("/") : pathParam ?? "";
  const targetBase = env.BNS_API_BASE || env.BNS_API_MAINNET || env.VITE_BNS_API_MAINNET || env.VITE_BNS_API_BASE || DEFAULT_BNS_BASE;
  const targetUrl = `${targetBase}/${path}${url.search}`;
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("origin");
  const body = request.method === "GET" || request.method === "HEAD" ? void 0 : await request.arrayBuffer();
  const response = await fetch(targetUrl, {
    method: request.method,
    headers,
    body,
    redirect: "follow"
  });
  const responseHeaders = new Headers(response.headers);
  responseHeaders.set("Access-Control-Allow-Origin", "*");
  responseHeaders.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  responseHeaders.set("Access-Control-Allow-Headers", "content-type");
  return new Response(response.body, {
    status: response.status,
    headers: responseHeaders
  });
}, "onRequest");
var mapRow2 = /* @__PURE__ */ __name2((row) => ({
  ...row,
  metadata: row.metadata ? JSON.parse(String(row.metadata)) : null
}), "mapRow");
var onRequest9 = /* @__PURE__ */ __name2(async ({ request, env }) => {
  if (request.method === "GET") {
    const statement = env.DB.prepare("SELECT * FROM collections ORDER BY created_at DESC");
    const result = await statement.all();
    return jsonResponse((result.results ?? []).map(mapRow2));
  }
  if (request.method === "POST") {
    try {
      const payload = await request.json();
      const slugRaw = String(payload.slug ?? "");
      const slug = normalizeSlug(slugRaw);
      if (!isValidSlug(slug)) {
        return badRequest("Slug must be 3-64 lowercase alphanumeric characters or hyphens.");
      }
      if (typeof payload.artistAddress !== "string" || payload.artistAddress.trim() === "") {
        return badRequest("artistAddress is required.");
      }
      const now = Date.now();
      const id = crypto.randomUUID();
      const metadata = payload.metadata ? JSON.stringify(payload.metadata) : null;
      await run(
        env,
        "INSERT INTO collections (id, slug, artist_address, contract_address, display_name, metadata, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [id, slug, payload.artistAddress.trim(), payload.contractAddress ?? null, payload.displayName ?? null, metadata, "draft", now, now]
      );
      const statement = env.DB.prepare("SELECT * FROM collections WHERE id = ?");
      const created = await statement.bind(id).all();
      const record = (created.results ?? [])[0];
      return jsonResponse(mapRow2(record), 201);
    } catch (error) {
      return serverError(error instanceof Error ? error.message : "failed to create collection");
    }
  }
  return jsonResponse({ error: "Method not allowed" }, 405);
}, "onRequest");
var routes = [
  {
    routePath: "/collections/:collectionId/assets",
    mountPath: "/collections/:collectionId",
    method: "",
    middlewares: [],
    modules: [onRequest]
  },
  {
    routePath: "/collections/:collectionId/publish",
    mountPath: "/collections/:collectionId",
    method: "",
    middlewares: [],
    modules: [onRequest2]
  },
  {
    routePath: "/collections/:collectionId/reserve",
    mountPath: "/collections/:collectionId",
    method: "",
    middlewares: [],
    modules: [onRequest3]
  },
  {
    routePath: "/collections/:collectionId/upload-url",
    mountPath: "/collections/:collectionId",
    method: "",
    middlewares: [],
    modules: [onRequest4]
  },
  {
    routePath: "/hiro/:network/:path*",
    mountPath: "/hiro/:network",
    method: "",
    middlewares: [],
    modules: [onRequest5]
  },
  {
    routePath: "/collections/health",
    mountPath: "/collections",
    method: "",
    middlewares: [],
    modules: [onRequest6]
  },
  {
    routePath: "/collections/:collectionId",
    mountPath: "/collections",
    method: "",
    middlewares: [],
    modules: [onRequest7]
  },
  {
    routePath: "/bns/:path*",
    mountPath: "/bns",
    method: "",
    middlewares: [],
    modules: [onRequest8]
  },
  {
    routePath: "/collections",
    mountPath: "/collections",
    method: "",
    middlewares: [],
    modules: [onRequest9]
  }
];
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count--;
          if (count === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
__name(lexer, "lexer");
__name2(lexer, "lexer");
function parse(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name2(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name2(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name2(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name2(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name2(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse, "parse");
__name2(parse, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
__name2(match, "match");
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name2(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key = keys[i2 - 1];
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i2].split(key.prefix + key.suffix).map(function(value) {
          return decode(value, key);
        });
      } else {
        params[key.name] = decode(m[i2], key);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
__name2(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
__name2(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
__name2(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
__name2(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
__name2(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
__name2(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route += "".concat(delimiterRe, "?");
    route += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route, flags(options));
}
__name(tokensToRegexp, "tokensToRegexp");
__name2(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");
__name2(pathToRegexp, "pathToRegexp");
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult) {
      for (const handler of route.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: mountMatchResult.path
        };
      }
    }
  }
  for (const route of routes) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route.modules.length) {
      for (const handler of route.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
__name2(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name2(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: /* @__PURE__ */ __name2(() => {
            isFailOpen = true;
          }, "passThroughOnException")
        };
        const response = await handler(context);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error) {
      if (isFailOpen) {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name2((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");
var drainBody = /* @__PURE__ */ __name2(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
__name2(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name2(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = pages_template_worker_default;
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
__name2(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
__name2(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");
__name2(__facade_invoke__, "__facade_invoke__");
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  static {
    __name(this, "___Facade_ScheduledController__");
  }
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name2(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name2(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name2(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
__name2(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name2((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name2((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
__name2(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody2 = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default2 = drainBody2;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError2(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError2(e.cause)
  };
}
__name(reduceError2, "reduceError");
var jsonError2 = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError2(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default2 = jsonError2;

// .wrangler/tmp/bundle-uUMfpR/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__2 = [
  middleware_ensure_req_body_drained_default2,
  middleware_miniflare3_json_error_default2
];
var middleware_insertion_facade_default2 = middleware_loader_entry_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__2 = [];
function __facade_register__2(...args) {
  __facade_middleware__2.push(...args.flat());
}
__name(__facade_register__2, "__facade_register__");
function __facade_invokeChain__2(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__2(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__2, "__facade_invokeChain__");
function __facade_invoke__2(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__2(request, env, ctx, dispatch, [
    ...__facade_middleware__2,
    finalMiddleware
  ]);
}
__name(__facade_invoke__2, "__facade_invoke__");

// .wrangler/tmp/bundle-uUMfpR/middleware-loader.entry.ts
var __Facade_ScheduledController__2 = class ___Facade_ScheduledController__2 {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__2)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler2(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__2 === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__2.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__2) {
    __facade_register__2(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__2(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__2(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler2, "wrapExportedHandler");
function wrapWorkerEntrypoint2(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__2 === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__2.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__2) {
    __facade_register__2(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__2(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__2(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint2, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY2;
if (typeof middleware_insertion_facade_default2 === "object") {
  WRAPPED_ENTRY2 = wrapExportedHandler2(middleware_insertion_facade_default2);
} else if (typeof middleware_insertion_facade_default2 === "function") {
  WRAPPED_ENTRY2 = wrapWorkerEntrypoint2(middleware_insertion_facade_default2);
}
var middleware_loader_entry_default2 = WRAPPED_ENTRY2;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__2 as __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default2 as default
};
//# sourceMappingURL=functionsWorker-0.3784010925961192.js.map
