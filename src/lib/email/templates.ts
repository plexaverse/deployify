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

export function teamInviteEmail(teamName: string, inviteUrl: string) {
    const subject = `Join ${teamName} on Deployify`;

    const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: sans-serif; line-height: 1.5; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 5px; }
          .header { margin-bottom: 20px; }
          .button { display: inline-block; background-color: #000; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-top: 20px; }
          .footer { margin-top: 30px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>You've been invited to join a team!</h2>
          </div>
          <p>You have been invited to join the team <strong>${teamName}</strong> on Deployify.</p>
          <p>Click the button below to accept the invitation:</p>
          <a href="${inviteUrl}" class="button">Join Team</a>
          <p>If you were not expecting this invitation, you can ignore this email.</p>
          <div class="footer">
            <p>Sent by Deployify</p>
          </div>
        </div>
      </body>
    </html>
    `;

    return { subject, html };
}
