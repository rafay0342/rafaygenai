import { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID } from "@/lib/env";

function isValidPhone(value: string) {
  return /^\+[1-9]\d{7,15}$/.test(value);
}

export async function POST(req: Request) {
  try {
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_VERIFY_SERVICE_SID) {
      return Response.json({ error: "Phone login not configured." }, { status: 400 });
    }
    const body = (await req.json()) as { phone?: string };
    const phone = (body.phone || "").trim();
    if (!isValidPhone(phone)) {
      return Response.json({ error: "Use full phone number with country code." }, { status: 400 });
    }

    const params = new URLSearchParams();
    params.set("To", phone);
    params.set("Channel", "sms");

    const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64");
    const response = await fetch(
      `https://verify.twilio.com/v2/Services/${TWILIO_VERIFY_SERVICE_SID}/Verifications`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      },
    );

    if (!response.ok) {
      const text = await response.text();
      return Response.json({ error: text || "Failed to send OTP." }, { status: response.status });
    }

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
