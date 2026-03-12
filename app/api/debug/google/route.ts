export async function GET() {
  return new Response(
    JSON.stringify({
      googleId: process.env.GOOGLE_CLIENT_ID || null,
      googleSecret: process.env.GOOGLE_CLIENT_SECRET || null,
      googleEnabled: Boolean(process.env.GOOGLE_CLIENT_ID) && Boolean(process.env.GOOGLE_CLIENT_SECRET),
    }),
    { headers: { "content-type": "application/json" } },
  );
}
