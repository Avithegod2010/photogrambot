# Webhook relay (optional)

Telegram webhooks require a public HTTPS endpoint. A phone can't accept one,
so PhotogramBot's optional webhook mode uses a tiny relay that:

1. receives Telegram updates at `POST /telegram/<secret>`,
2. stores them in a queue, and
3. serves `GET /updates?offset=N` to the app.

The app still polls the relay, but with a short HTTPS request instead of a
long-polling connection, which is cheaper on battery and mobile radio. While a
webhook is registered Telegram rejects `getUpdates`, so if the relay is
unreachable the app returns no updates and retries next poll; switch **Back to
polling** in Settings to restore direct polling.

## Cloudflare Worker

```js
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname.startsWith("/telegram/")) {
      const secret = url.pathname.slice("/telegram/".length);
      if (secret !== env.RELAY_SECRET) return new Response("forbidden", { status: 403 });
      const update = await request.json();
      await env.PB_UPDATES.put(`u:${String(update.update_id).padStart(16, "0")}`, JSON.stringify(update));
      return new Response("ok");
    }
    if (request.method === "GET" && url.pathname === "/updates") {
      if (request.headers.get("authorization") !== `Bearer ${env.RELAY_SECRET}`) {
        return new Response("forbidden", { status: 403 });
      }
      const offset = Number(url.searchParams.get("offset") || 0);
      const list = await env.PB_UPDATES.list({ prefix: "u:" });
      const result = [];
      for (const key of list.keys) {
        const id = Number(key.name.slice(2));
        if (id < offset) continue;
        const raw = await env.PB_UPDATES.get(key.name);
        if (raw) result.push(JSON.parse(raw));
        if (result.length >= 100) break;
      }
      return Response.json({ ok: true, result });
    }
    return new Response("not found", { status: 404 });
  },
};
```

Bind a KV namespace as `PB_UPDATES`, set `RELAY_SECRET` (the same value you
enter in Settings → Remote & sharing), and deploy.

Then in Settings:

- Relay URL: `https://<worker>.workers.dev`
- Relay secret: the `RELAY_SECRET` value
- Press **Enable webhook** — the app calls Telegram `setWebhook` with
  `https://<worker>.workers.dev/telegram/<secret>`.

Telegram includes the same secret in the `X-Telegram-Bot-Api-Secret-Token`
header; the path check above is a simpler equivalent. For stricter validation,
compare that header instead.

## Notes

- The relay stores updates at-least-once; the app's `updates_offset` makes
  processing idempotent.
- Updates older than Telegram's retention window cannot be recovered.
- Press **Back to polling** to call `deleteWebhook`; long polling resumes.
- Run the relay on infrastructure you control. It sees the same updates the
  bot sees, so treat `RELAY_SECRET` as a credential.
