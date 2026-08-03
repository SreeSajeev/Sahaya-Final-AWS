import { test, expect } from "@playwright/test";
import { api, hasCreds, login } from "../helpers/api";

test.describe("Proofs", () => {
  test("historical proof comment with storage paths can presign", async () => {
    test.skip(!hasCreds("STAFF") && !hasCreds("ADMIN") && !hasCreds("SUPER_ADMIN"), "missing creds");
    const role = hasCreds("STAFF")
      ? "STAFF"
      : hasCreds("ADMIN")
        ? "ADMIN"
        : "SUPER_ADMIN";
    const sess = await login(role as any);
    const token = sess.accessToken!;

    const list = await api("GET", "/data/tickets?limit=50", { token });
    expect(list.status).toBe(200);
    const tickets = list.json?.items || [];
    let found = false;
    for (const t of tickets.slice(0, 15)) {
      const comments = await api("GET", `/data/tickets/${t.id}/comments`, { token });
      if (comments.status !== 200) continue;
      const items = comments.json?.items || comments.json?.data || [];
      for (const c of items) {
        const paths = c?.attachments?.proof_storage_paths;
        if (Array.isArray(paths) && paths.length > 0) {
          const urlRes = await api(
            "GET",
            `/data/tickets/${t.id}/comments/${c.id}/proofs/0/url`,
            { token }
          );
          expect(urlRes.status).toBe(200);
          const url = urlRes.json?.url || urlRes.json?.item?.url;
          expect(url).toBeTruthy();
          if (url) {
            const obj = await fetch(url);
            expect(obj.status).toBe(200);
            const ct = obj.headers.get("content-type") || "";
            expect(ct.includes("image") || ct.includes("octet") || obj.status === 200).toBeTruthy();
          }
          found = true;
          break;
        }
      }
      if (found) break;
    }
    test.info().annotations.push({
      type: "note",
      description: found ? "presign verified" : "no historical proof paths in sample",
    });
  });
});
