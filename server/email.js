import nodemailer from 'nodemailer';

let cachedTransport = null;
let cachedSignature = '';

const toText = (value, max = 1024) => String(value || '').trim().slice(0, max);
const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const readEmailConfig = () => {
  const env = globalThis.process?.env || {};
  const smtpUrl = toText(env.SMTP_URL, 2048);
  const host = toText(env.SMTP_HOST, 512);
  const port = Math.max(1, Math.min(65535, Number.parseInt(String(env.SMTP_PORT || '587'), 10) || 587));
  const secureFlag = toText(env.SMTP_SECURE, 16).toLowerCase();
  const secure = secureFlag
    ? ['1', 'true', 'yes', 'on'].includes(secureFlag)
    : port === 465;
  const user = toText(env.SMTP_USER, 512);
  const password = String(env.SMTP_PASSWORD || '');
  const from = toText(env.SMTP_FROM || env.MAIL_FROM, 512);
  const replyTo = toText(env.SMTP_REPLY_TO || env.MAIL_REPLY_TO, 512);
  const publicUrl = toText(env.APP_PUBLIC_URL || env.PUBLIC_APP_URL, 2048).replace(/\/+$/, '');
  return {
    smtpUrl,
    host,
    port,
    secure,
    user,
    password,
    from,
    replyTo,
    publicUrl,
  };
};

const getTransport = () => {
  const config = readEmailConfig();
  if (!config.from) throw new Error('SMTP_FROM is not configured');
  if (!config.publicUrl || !/^https?:\/\//i.test(config.publicUrl)) {
    throw new Error('APP_PUBLIC_URL must be configured with the public http(s) address');
  }
  if (!config.smtpUrl && !config.host) throw new Error('SMTP_HOST or SMTP_URL is not configured');
  if (config.user && !config.password) throw new Error('SMTP_PASSWORD is not configured');

  const signature = JSON.stringify({
    smtpUrl: config.smtpUrl,
    host: config.host,
    port: config.port,
    secure: config.secure,
    user: config.user,
    password: config.password,
  });
  if (!cachedTransport || signature !== cachedSignature) {
    cachedTransport = config.smtpUrl
      ? nodemailer.createTransport(config.smtpUrl)
      : nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: config.user ? { user: config.user, pass: config.password } : undefined,
      });
    cachedSignature = signature;
  }
  return { transport: cachedTransport, config };
};

export const buildInvitationUrl = (token) => {
  const config = readEmailConfig();
  if (!config.publicUrl || !/^https?:\/\//i.test(config.publicUrl)) {
    throw new Error('APP_PUBLIC_URL must be configured with the public http(s) address');
  }
  const url = new globalThis.URL(config.publicUrl);
  url.searchParams.set('invite', String(token || ''));
  return url.toString();
};

export const sendUserInvitationEmail = async ({
  to,
  fullName,
  clientId,
  clientName,
  token,
  expiresAt,
}) => {
  const { transport, config } = getTransport();
  const invitationUrl = buildInvitationUrl(token);
  const safeName = toText(fullName, 160) || 'der';
  const safeClientName = toText(clientName, 160) || toText(clientId, 120);
  const expires = new Date(expiresAt);
  const expiryLabel = Number.isNaN(expires.getTime())
    ? ''
    : expires.toLocaleString('nb-NO', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Oslo' });
  const subject = `Du er invitert til ${safeClientName || 'Smart Sauna Systems'}`;

  const text = [
    `Hei ${safeName},`,
    '',
    `Du har fått tilgang til ${safeClientName || 'Smart Sauna Systems'}.`,
    'Åpne lenken nedenfor for å velge brukernavn og passord:',
    invitationUrl,
    '',
    `Kunde-ID ved innlogging: ${clientId}`,
    expiryLabel ? `Invitasjonen er gyldig til ${expiryLabel}.` : '',
    '',
    'Slik logger du inn etterpå:',
    `1. Åpne ${config.publicUrl}`,
    `2. Skriv inn Kunde-ID: ${clientId}`,
    '3. Bruk brukernavnet og passordet du valgte',
    '',
    'Hvis du ikke forventet denne invitasjonen, kan du se bort fra e-posten.',
  ].filter((line) => line !== '').join('\n');

  const html = `<!doctype html>
<html lang="nb">
  <body style="margin:0;background:#101b21;color:#eaf2f2;font-family:Arial,sans-serif;">
    <div style="max-width:620px;margin:0 auto;padding:40px 20px;">
      <div style="border:1px solid #29414a;background:#17272e;padding:36px;border-radius:20px;">
        <p style="margin:0 0 12px;color:#88a6ad;font-size:12px;letter-spacing:.16em;text-transform:uppercase;">Smart Sauna Systems</p>
        <h1 style="margin:0 0 20px;font-size:28px;font-weight:600;">Velkommen, ${escapeHtml(safeName)}</h1>
        <p style="margin:0 0 24px;color:#bfd0d3;line-height:1.6;">Du har fått tilgang til <strong style="color:#f1f7f7;">${escapeHtml(safeClientName)}</strong>. Velg brukernavn og passord for å aktivere kontoen.</p>
        <a href="${escapeHtml(invitationUrl)}" style="display:inline-block;background:#ed9b4a;color:#182126;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:10px;">Aktiver kontoen</a>
        <div style="margin-top:28px;padding-top:24px;border-top:1px solid #29414a;color:#a9bec3;font-size:14px;line-height:1.65;">
          <p style="margin:0 0 8px;"><strong style="color:#eaf2f2;">Kunde-ID:</strong> ${escapeHtml(clientId)}</p>
          ${expiryLabel ? `<p style="margin:0 0 18px;"><strong style="color:#eaf2f2;">Gyldig til:</strong> ${escapeHtml(expiryLabel)}</p>` : ''}
          <p style="margin:0;">Etter aktivering logger du inn på <a href="${escapeHtml(config.publicUrl)}" style="color:#f2b574;">${escapeHtml(config.publicUrl)}</a> med Kunde-ID-en over og opplysningene du valgte.</p>
        </div>
      </div>
      <p style="margin:18px 4px 0;color:#6f8b92;font-size:12px;line-height:1.5;">Hvis du ikke forventet denne invitasjonen, kan du se bort fra e-posten.</p>
    </div>
  </body>
</html>`;

  const info = await transport.sendMail({
    from: config.from,
    replyTo: config.replyTo || undefined,
    to,
    subject,
    text,
    html,
  });
  return {
    messageId: toText(info?.messageId, 512),
    accepted: Array.isArray(info?.accepted) ? info.accepted.map((entry) => String(entry)) : [],
  };
};
