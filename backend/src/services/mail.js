import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

let transporter = null;

export function isMailConfigured() {
  return Boolean(env.smtp.host && env.smtp.user && env.smtp.pass);
}

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      auth: { user: env.smtp.user, pass: env.smtp.pass },
    });
  }
  return transporter;
}

export async function sendPasswordResetEmail(to, token) {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto; padding: 24px; background: #f1f7f8; border-radius: 12px;">
      <h2 style="color: #073d46; margin-top: 0;">Recupera tu contraseña</h2>
      <p style="color: #315f6c;">Recibimos una solicitud para restablecer la contraseña de tu cuenta de <strong>MendoCash</strong>.</p>
      <p style="color: #315f6c;">Este es tu código de recuperación:</p>
      <div style="background: #ffffff; border: 1px solid #dce8ec; border-radius: 8px; padding: 16px; text-align: center; font-size: 18px; word-break: break-all; color: #10a992; font-weight: bold;">
        ${token}
      </div>
      <p style="color: #77919a; font-size: 12px; margin-top: 16px;">
        Entra a <a href="${env.smtp.appUrl}" style="color: #10a992;">MendoCash</a>, pulsa "¿Olvidaste tu contraseña?", pega este código y escribe tu nueva contraseña.
      </p>
      <p style="color: #77919a; font-size: 12px;">Este código expira en 1 hora. Si no solicitaste este cambio, ignora este correo.</p>
    </div>
  `;

  await getTransporter().sendMail({
    from: `MendoCash <${env.smtp.from}>`,
    to,
    subject: 'Restablece tu contraseña de MendoCash',
    html,
  });
}
