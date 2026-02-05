export function usageAlertEmail(
    userName: string,
    metric: string,
    usage: number,
    limit: number
) {
    const percentage = Math.round((usage / limit) * 100);
    const subject = `Usage Alert: You've reached ${percentage}% of your ${metric} limit`;

    const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: sans-serif; line-height: 1.5; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 5px; }
          .header { margin-bottom: 20px; }
          .alert { color: #d97706; font-weight: bold; }
          .footer { margin-top: 30px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>Deployify Usage Alert</h2>
          </div>
          <p>Hi ${userName},</p>
          <p>You have used <span class="alert">${usage}</span> out of <span class="alert">${limit}</span> ${metric} included in your plan.</p>
          <p>This is <strong>${percentage}%</strong> of your monthly limit.</p>
          <p>If you exceed your limit, your deployments may be paused or you may need to upgrade your plan.</p>

          <div class="footer">
            <p>Sent by Deployify</p>
          </div>
        </div>
      </body>
    </html>
    `;

    return { subject, html };
}
