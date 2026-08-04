import { test, expect } from "@playwright/test";
import { api, hasCreds, login } from "../helpers/api";

test.describe("Security", () => {
  test("unauthenticated tickets denied", async () => {
    const res = await api("GET", "/data/tickets?limit=1");
    expect([401, 403].includes(res.status)).toBeTruthy();
  });

  test("tenant isolation — ADMIN list has no foreign org tickets", async () => {
    test.skip(!hasCreds("ADMIN"), "missing ADMIN creds");
    await new Promise((r) => setTimeout(r, 1500));
    const sess = await login("ADMIN");
    expect(sess.status).toBe(200);
    const orgId = sess.profile?.organisation_id as string | undefined;
    expect(orgId).toBeTruthy();
    const list = await api("GET", "/data/tickets?limit=100", { token: sess.accessToken });
    expect(list.status).toBe(200);
    const items = list.json?.items || [];
    const foreign = items.filter(
      (t: any) => t.organisation_id && t.organisation_id !== orgId
    );
    expect(foreign.length).toBe(0);
  });

  test("IDOR — ADMIN cannot fetch foreign ticket by id when SA finds one", async () => {
    test.skip(!hasCreds("ADMIN") || !hasCreds("SUPER_ADMIN"), "need SA+ADMIN");
    const sa = await login("SUPER_ADMIN");
    const adm = await login("ADMIN");
    const admOrg = adm.profile?.organisation_id as string | undefined;
    const saList = await api("GET", "/data/tickets?limit=100", { token: sa.accessToken });
    const foreign = (saList.json?.items || []).find(
      (t: any) => t.organisation_id && admOrg && t.organisation_id !== admOrg
    );
    test.skip(!foreign, "no foreign ticket in sample");
    const idor = await api("GET", `/data/tickets/${foreign.id}`, { token: adm.accessToken });
    expect([403, 404].includes(idor.status)).toBeTruthy();
  });

  test("expired / garbage bearer rejected", async () => {
    const res = await api("GET", "/auth/me", { token: "not.a.jwt" });
    expect([401, 403].includes(res.status)).toBeTruthy();
  });
});
