const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const json = (data, init = {}) => new Response(JSON.stringify(data), {
  status: init.status || 200,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...CORS_HEADERS,
  },
});

export const onRequestOptions = () => new Response(null, { status: 204, headers: CORS_HEADERS });

export const onRequestGet = async ({ env }) => {
  const result = await env.ROOMS_KV.list({ prefix: "room:", limit: 1000 });
  const rooms = await Promise.all(result.keys.map(async (k) => {
    const id = k.name.replace(/^room:/, "");
    let name = k.metadata?.name;
    let updatedAt = k.metadata?.updatedAt || 0;
    if (!name) {
      const v = await env.ROOMS_KV.getWithMetadata(k.name, { type: "json" });
      name = v.value?.name || "";
      const version = v.metadata?.version || crypto.randomUUID();
      updatedAt = v.metadata?.updatedAt || Date.now();
      if (v.value) {
        await env.ROOMS_KV.put(k.name, JSON.stringify(v.value), {
          metadata: { version, updatedAt, name },
        });
      }
    }
    return { id, name: name || "(無名)", updatedAt };
  }));
  rooms.sort((a, b) => b.updatedAt - a.updatedAt);
  return json({ rooms });
};
