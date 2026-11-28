import nodemailer from 'nodemailer';

// SMTP gratis: Outlook/Hotmail, Gmail con contraseña de aplicación, Brevo, etc.
// Las credenciales se leen de variables de entorno; nunca se escriben en el chat ni en el código.
export function mailConfigured() {
  return Boolean(
    process.env.SMTP_HOST
    && process.env.SMTP_USER
    && process.env.SMTP_PASS
    && (process.env.SMTP_FROM || process.env.SMTP_USER)
  );
}

export async function sendLoginCode(email, code) {
  if (!mailConfigured()) throw new Error('El correo no está configurado.');

  const port = Number(process.env.SMTP_PORT || 587);
  const transport = process.env.SMTP_TRANSPORT === 'json'
    ? nodemailer.createTransport({ jsonTransport: true })
    : nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: port === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      });

  const info = await transport.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: email,
    subject: 'Tu código de Heph',
    text: `Tu código para entrar a Heph es ${code}. Vence en 10 minutos. Si no fuiste vos, ignorá este correo.`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.5">
      <h2>Heph</h2>
      <p>Tu código para entrar es:</p>
      <p style="font-size:28px;letter-spacing:6px;font-weight:700">${code}</p>
      <p>Vence en 10 minutos. Si no fuiste vos, ignorá este correo.</p>
    </div>`
  });

  // Modo de prueba local: NUNCA activar en Render. El código no se devuelve en la API.
  if (process.env.OTP_DEV_CODE === '1') {
    console.log(`[Heph OTP dev] ${email} -> ${code}`);
    if (process.env.SMTP_TRANSPORT === 'json') console.log(`[Heph mail dev] ${info.message}`);
  }
  return info;
}
