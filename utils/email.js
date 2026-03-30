const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const baseTemplate = (content) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', sans-serif; background: #f4f6f8; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 32px; text-align: center; }
    .header h1 { color: #e2c27d; margin: 0; font-size: 24px; letter-spacing: 1px; }
    .header p { color: #94a3b8; margin: 8px 0 0; font-size: 14px; }
    .body { padding: 32px; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
    .badge-blue { background: #dbeafe; color: #1d4ed8; }
    .badge-green { background: #dcfce7; color: #15803d; }
    .badge-red { background: #fee2e2; color: #dc2626; }
    .badge-amber { background: #fef3c7; color: #d97706; }
    .info-box { background: #f8fafc; border-left: 4px solid #e2c27d; padding: 16px; border-radius: 0 8px 8px 0; margin: 16px 0; }
    .btn { display: inline-block; padding: 12px 28px; background: #e2c27d; color: #1a1a2e; text-decoration: none; border-radius: 8px; font-weight: 600; margin-top: 20px; }
    .footer { background: #f8fafc; padding: 20px 32px; text-align: center; color: #94a3b8; font-size: 12px; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎓 Placement Cell</h1>
      <p>Career Development & Placement Office</p>
    </div>
    <div class="body">${content}</div>
    <div class="footer">
      <p>This is an automated message. Please do not reply to this email.</p>
      <p>© ${new Date().getFullYear()} College Placement Cell. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
`;

exports.sendEmail = async ({ to, subject, html }) => {
  try {
    await transporter.sendMail({
      from: `"Placement Cell" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html: baseTemplate(html)
    });
    console.log(`Email sent to ${to}: ${subject}`);
  } catch (err) {
    console.error('Email send failed:', err.message);
    // Don't throw — email failure shouldn't break the main flow
  }
};

exports.emailTemplates = {
  applicationSubmitted: (studentName, jobTitle, companyName) => ({
    subject: `Application Submitted — ${jobTitle} at ${companyName}`,
    html: `
      <h2>Hi ${studentName},</h2>
      <p>Your application has been <strong>successfully submitted</strong>!</p>
      <div class="info-box">
        <strong>Position:</strong> ${jobTitle}<br>
        <strong>Company:</strong> ${companyName}<br>
        <strong>Status:</strong> <span class="badge badge-blue">Under Review</span>
      </div>
      <p>We'll notify you as soon as there's an update on your application. Good luck! 🍀</p>
    `
  }),

  applicationStatusUpdate: (studentName, jobTitle, status, feedback) => ({
    subject: `Application Update — ${jobTitle}`,
    html: `
      <h2>Hi ${studentName},</h2>
      <p>There's an update on your application for <strong>${jobTitle}</strong>.</p>
      <div class="info-box">
        <strong>New Status:</strong> <span class="badge ${
          status === 'shortlisted' ? 'badge-green' :
          status === 'rejected' ? 'badge-red' :
          status === 'offered' ? 'badge-green' : 'badge-blue'
        }">${status.replace(/_/g, ' ').toUpperCase()}</span>
        ${feedback ? `<br><br><strong>Feedback:</strong> ${feedback}` : ''}
      </div>
    `
  }),

  interviewScheduled: (studentName, jobTitle, companyName, scheduledAt, format, meetingUrl, venue, roundName) => ({
    subject: `Interview Scheduled — ${roundName} for ${jobTitle}`,
    html: `
      <h2>Hi ${studentName},</h2>
      <p>Your interview has been <strong>scheduled</strong>!</p>
      <div class="info-box">
        <strong>Position:</strong> ${jobTitle} at ${companyName}<br>
        <strong>Round:</strong> ${roundName}<br>
        <strong>Date & Time:</strong> ${new Date(scheduledAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST<br>
        <strong>Format:</strong> ${format}<br>
        ${meetingUrl ? `<strong>Meeting Link:</strong> <a href="${meetingUrl}">${meetingUrl}</a><br>` : ''}
        ${venue ? `<strong>Venue:</strong> ${venue}` : ''}
      </div>
      <p>Please be ready 10 minutes before the scheduled time. Dress professionally and ensure your internet connection is stable for virtual interviews.</p>
      <p><strong>Best of luck! 💪</strong></p>
    `
  }),

  offerLetter: (studentName, jobTitle, companyName, packageAmount, deadline) => ({
    subject: `🎉 Offer Letter — ${jobTitle} at ${companyName}`,
    html: `
      <h2>Congratulations, ${studentName}! 🎉</h2>
      <p>You have received an <strong>offer letter</strong>!</p>
      <div class="info-box">
        <strong>Position:</strong> ${jobTitle}<br>
        <strong>Company:</strong> ${companyName}<br>
        <strong>Package:</strong> ${packageAmount} LPA<br>
        <strong>Accept By:</strong> ${new Date(deadline).toLocaleDateString()}
      </div>
      <p>Please log in to the placement portal to accept or decline this offer before the deadline.</p>
    `
  })
};
