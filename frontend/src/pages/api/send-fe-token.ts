import postmark from "postmark";

const client = new postmark.ServerClient(
  process.env.POSTMARK_SERVER_TOKEN!
);

export default async function handler(req: Request) {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const { feEmail, ticketNumber, token, link } = await req.json();

    if (!feEmail || !token || !link) {
      return new Response("Missing data", { status: 400 });
    }

    await client.sendEmail({
      From: "support@pariskq.in",
      To: feEmail,
      Subject: `Action required – Ticket ${ticketNumber}`,
      TextBody: `
Ticket: ${ticketNumber}

Your action token:
${token}

Open ticket:
${link}
      `,
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Postmark error", err);
    return new Response("Email failed", { status: 500 });
  }
}
