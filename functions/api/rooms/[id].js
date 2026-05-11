const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, If-Match",
};

const json = (data, init = {}) => new Response(JSON.stringify(data), {
  status: init.status || 200,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...CORS_HEADERS,
    ...(init.headers || {}),
  },
});

const isValidId = (id) => typeof id === "string" && /^[a-zA-Z0-9_-]{4,64}$/.test(id);

const KEY = (id) => `room:${id}`;

const newVersion = () => crypto.randomUUID();

const sanitizeRoom = (raw) => {
  if (!raw || typeof raw !== "object") return null;
  const name = typeof raw.name === "string" ? raw.name.slice(0, 60) : "";
  const entries = Array.isArray(raw.entries) ? raw.entries : [];
  const cleanedEntries = entries.slice(0, 500).map((e) => ({
    id: typeof e.id === "string" ? e.id.slice(0, 80) : crypto.randomUUID(),
    person: typeof e.person === "string" ? e.person.slice(0, 40) : "",
    amount: Number.isFinite(+e.amount) ? Math.max(0, Math.round(+e.amount)) : 0,
    note: typeof e.note === "string" ? e.note.slice(0, 200) : "",
    beneficiaries: Array.isArray(e.beneficiaries)
      ? e.beneficiaries.filter((b) => typeof b === "string").slice(0, 10)
      : undefined,
    createdAt: Number.isFinite(+e.createdAt) ? +e.createdAt : Date.now(),
  }));
  return { name, entries: cleanedEntries };
};

export const onRequestOptions = () => new Response(null, { status: 204, headers: CORS_HEADERS });

export const onRequestGet = async ({ params, env }) => {
  const id = params.id;
  if (!isValidId(id)) return json({ error: "invalid_id" }, { status: 400 });

  const value = await env.ROOMS_KV.getWithMetadata(KEY(id), { type: "json" });
  if (!value.value) return json({ error: "not_found" }, { status: 404 });

  const version = value.metadata?.version || "0";
  return json({ ...value.value, version }, {
    headers: { ETag: `"${version}"` },
  });
};

export const onRequestPut = async ({ params, env, request }) => {
  const id = params.id;
  if (!isValidId(id)) return json({ error: "invalid_id" }, { status: 400 });

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, { status: 400 });
  }

  const sanitized = sanitizeRoom(body);
  if (!sanitized) return json({ error: "invalid_body" }, { status: 400 });

  const existing = await env.ROOMS_KV.getWithMetadata(KEY(id), { type: "json" });
  const currentVersion = existing.metadata?.version;
  const ifMatch = request.headers.get("If-Match")?.replace(/"/g, "");

  if (currentVersion && ifMatch && ifMatch !== currentVersion) {
    return json({
      error: "version_conflict",
      current: { ...existing.value, version: currentVersion },
    }, { status: 409 });
  }

  const nextVersion = newVersion();
  const updatedAt = Date.now();
  await env.ROOMS_KV.put(KEY(id), JSON.stringify(sanitized), {
    metadata: { version: nextVersion, updatedAt, name: sanitized.name },
  });

  return json({ ...sanitized, version: nextVersion }, {
    headers: { ETag: `"${nextVersion}"` },
  });
};

export const onRequestDelete = async ({ params, env }) => {
  const id = params.id;
  if (!isValidId(id)) return json({ error: "invalid_id" }, { status: 400 });
  await env.ROOMS_KV.delete(KEY(id));
  return json({ ok: true });
};
