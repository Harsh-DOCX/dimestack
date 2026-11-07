const nodemailer = require('nodemailer');
const config = require('./config');

let transporter;

function getTransporter() {
  if (!config.smtp.host) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    });
  }
  return transporter;
}

async function sendMail({ to, subject, text }) {
  const transport = getTransporter();
  if (!transport) {
    console.log('\n----- DimeStack email (no SMTP configured) -----');
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(text);
    console.log('------------------------------------------------\n');
    return { delivered: false, preview: text };
  }
  await transport.sendMail({ from: config.smtp.from, to, subject, text });
  return { delivered: true };
}

module.exports = { sendMail };
