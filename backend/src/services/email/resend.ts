const RESEND_API = 'https://api.resend.com/emails';

type EmailTemplate = 'welcome' | 'video_ready' | 'low_actions' | 'we_miss_you';

const TEMPLATES: Record<EmailTemplate, (data: Record<string, string>) => { subject: string; html: string }> = {
  welcome: (d) => ({
    subject: 'Welcome to Xroga — Your AI Swarm Awaits',
    html: `<h1>Welcome, ${d.name}!</h1><p>You have <strong>50 free Actions</strong> to explore all 92 features. Start building at <a href="${d.appUrl}">xroga.com</a>.</p>`,
  }),
  video_ready: (d) => ({
    subject: 'Your video is ready!',
    html: `<p>Great news — your video project <strong>${d.projectName}</strong> is complete. <a href="${d.projectUrl}">View it now</a>.</p>`,
  }),
  low_actions: (d) => ({
    subject: 'Actions running low',
    html: `<p>You have only <strong>${d.remaining}</strong> Actions left (${d.percent}% of your plan). <a href="${d.billingUrl}">Upgrade or top up</a> to keep building.</p>`,
  }),
  we_miss_you: (d) => ({
    subject: 'We miss you at Xroga',
    html: `<p>It's been a while since your last visit. Your Swarm is ready when you are — <a href="${d.appUrl}">come back and build something amazing</a>.</p>`,
  }),
};

export async function sendEmail(
  to: string,
  template: EmailTemplate,
  data: Record<string, string> = {}
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[email] Skipping ${template} to ${to} — RESEND_API_KEY not set`);
    return false;
  }

  const { subject, html } = TEMPLATES[template]({
    appUrl: process.env.FRONTEND_URL ?? 'https://xroga.com',
    billingUrl: `${process.env.FRONTEND_URL ?? 'https://xroga.com'}/dashboard/billing`,
    ...data,
  });

  const res = await fetch(RESEND_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL ?? 'Xroga <hello@xroga.com>',
      to: [to],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    console.error('Resend email failed:', await res.text());
    return false;
  }
  return true;
}

export async function sendWelcomeEmail(userId: string, email: string, name: string): Promise<void> {
  await sendEmail(email, 'welcome', { name, user_id: userId });
}

export async function sendLowActionsEmail(email: string, remaining: number, total: number): Promise<void> {
  const percent = total > 0 ? Math.round((remaining / total) * 100) : 0;
  if (percent <= 20) {
    await sendEmail(email, 'low_actions', { remaining: String(remaining), percent: String(percent) });
  }
}
