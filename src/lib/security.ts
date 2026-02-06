import crypto from "crypto";

export function hashSecret(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function generateApiKey() {
  const prefix = "grok";
  const token = crypto.randomBytes(32).toString("hex");
  return {
    plain: `${prefix}_${token}`,
    prefix,
    hash: hashSecret(`${prefix}_${token}`),
  };
}
