import { beforeEach, describe, expect, it, vi } from "vitest";

const server = vi.hoisted(() => ({ sendMail: vi.fn(), close: vi.fn() }));
vi.mock("nodemailer", () => ({ createTransport: () => server }));

import { log } from "../observability/logger";
import { smtpMailer } from "./mailer";

const config = { host: "smtp.example", port: 465, secure: true, user: "connect@wonderapps.biz", password: "not-a-real-password", from: "WonderHome <connect@wonderapps.biz>" };
const mail = { to: "asha@example.com", subject: "Test", text: "Hello", html: "<p>Hello</p>" };

beforeEach(() => {
  server.sendMail.mockReset();
  vi.restoreAllMocks();
});

describe("sending through the mail server", () => {
  it("is sent only when the server takes the one recipient, and leaves its id and code, never the address", async () => {
    const logged: string[] = [];
    vi.spyOn(log, "info").mockImplementation((message, fields) => void logged.push(`${message} ${JSON.stringify(fields)}`));
    server.sendMail.mockResolvedValue({ messageId: "<abc@wonderapps.biz>", accepted: [mail.to], rejected: [], response: "250 2.0.0 Ok: queued as 123" });
    expect(await smtpMailer(config).send(mail)).toEqual({ ok: true });
    expect(logged).toEqual(['email accepted {"messageId":"<abc@wonderapps.biz>","code":250}']);
    expect(logged.join("")).not.toContain(mail.to);
  });

  it("is a rejection when the server takes the message but refuses the recipient", async () => {
    vi.spyOn(log, "info").mockImplementation(() => undefined);
    server.sendMail.mockResolvedValue({ messageId: "<abc@wonderapps.biz>", accepted: [], rejected: [mail.to], response: "250 2.0.0 Ok" });
    expect(await smtpMailer(config).send(mail)).toEqual({ ok: false, reason: "rejected" });
  });

  it("tells a refusal from an unreachable server", async () => {
    vi.spyOn(log, "warn").mockImplementation(() => undefined);
    server.sendMail.mockRejectedValueOnce(Object.assign(new Error("550 no such user"), { responseCode: 550 }));
    expect(await smtpMailer(config).send(mail)).toEqual({ ok: false, reason: "rejected" });
    server.sendMail.mockRejectedValueOnce(new Error("ETIMEDOUT"));
    expect(await smtpMailer(config).send(mail)).toEqual({ ok: false, reason: "unreachable" });
  });
});
