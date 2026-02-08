// Email templates and types (client-safe)
export interface EmailTemplate {
  subject: string;
  html: string;
  text?: string;
}

export interface EmailData {
  to: string;
  from?: string;
  subject: string;
  html: string;
  text?: string;
}

// Email templates with embedded logo SVG (converted to base64 for maximum email compatibility)

// Email templates with professional CSS-based logo
const getEmailHeader = () => `
  <div style="text-align: center; margin-bottom: 40px; padding: 20px 0; border-bottom: 1px solid #e5e5e5;">
    <!-- Logo Reffo base64 per massima compatibilità -->
    <div style="text-align: center; margin-bottom: 16px;">
      <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAuAAAALgCAYAAADV3sIJAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAC90SURBVHgB7d2BdeTGnefx3/pdALoIDo5gZyO4cgZyBIYj8GwEQ0cgOYJuRyBdBE1HIG0E3ReBdBH4CDe5oqghh02iCyjU5/Pe/0nelS0O0Cx8CVajEwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" alt="Reffo" style="width: 48px; height: 48px; display: inline-block; border: 0;" />
    </div>
    <h1 style="color: #000; margin: 0 0 4px 0; font-size: 28px; font-weight: 700; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; letter-spacing: -0.5px;">Reffo</h1>
    <p style="color: #666; margin: 0; font-size: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">Professional Visual Reference Platform</p>
  </div>
`;

const getEmailFooter = () => `
  <div style="margin-top: 48px; padding-top: 24px; border-top: 1px solid #e5e5e5; text-align: center; color: #666; font-size: 14px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
    <div style="margin-bottom: 24px;">
      <a href="https://reffo.studio" style="color: #000; text-decoration: none; margin: 0 16px; font-weight: 500;">Website</a>
      <a href="https://reffo.studio/help" style="color: #000; text-decoration: none; margin: 0 16px; font-weight: 500;">Support</a>
      <a href="https://reffo.studio/dashboard-app/settings" style="color: #000; text-decoration: none; margin: 0 16px; font-weight: 500;">Settings</a>
    </div>
    
    <p style="margin: 16px 0; font-size: 14px; color: #666;">
      <strong style="color: #000;">Reffo Studio</strong><br>
      Professional visual reference platform
    </p>
    
    <p style="margin: 16px 0; font-size: 12px; color: #999;">
      You are receiving this email because you have an account with Reffo.<br>
      You can <a href="https://reffo.studio/dashboard-app/settings" style="color: #000; text-decoration: none;">manage your preferences</a> at any time.
    </p>
    
    <p style="margin: 16px 0 0 0; font-size: 12px; color: #999;">
      © ${new Date().getFullYear()} Reffo Studio. All rights reserved.
    </p>
  </div>
`;

// Email templates
export const emailTemplates = {
  welcome: (userName: string): EmailTemplate => ({
    subject: 'Welcome to Reffo',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Welcome to Reffo</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.7; color: #333; max-width: 600px; margin: 0 auto; padding: 24px; background-color: #ffffff;">
          ${getEmailHeader()}
          
          <div style="padding: 32px 0;">
            <h2 style="color: #000; margin: 0 0 24px 0; font-size: 24px; font-weight: 600;">Welcome to Reffo, ${userName}</h2>
            <p style="margin: 0 0 24px 0; font-size: 16px; color: #333;">Your account has been successfully created. Reffo is a professional platform designed to help you organize, manage, and share visual references efficiently.</p>
            
            <h3 style="color: #000; margin: 32px 0 16px 0; font-size: 18px; font-weight: 600;">Key Features</h3>
            <ul style="margin: 0 0 32px 0; padding-left: 20px; color: #333;">
              <li style="margin: 8px 0;"><strong>Visual Organization:</strong> Create structured moodboards and reference collections</li>
              <li style="margin: 8px 0;"><strong>Team Collaboration:</strong> Share boards and work together seamlessly</li>
              <li style="margin: 8px 0;"><strong>Smart Tagging:</strong> Organize content with intelligent categorization</li>
              <li style="margin: 8px 0;"><strong>Cross-Platform Access:</strong> Access your work from any device</li>
            </ul>
            
            <div style="text-align: center; margin: 40px 0;">
              <a href="https://reffo.studio/dashboard-app/dashboard" style="background: #000; color: white; padding: 16px 32px; text-decoration: none; border-radius: 4px; display: inline-block; font-weight: 500; font-size: 16px;">Access Dashboard</a>
            </div>
          </div>
          
          ${getEmailFooter()}
        </body>
      </html>
    `,
    text: `Welcome to Reffo, ${userName}!\n\nYour account has been successfully created. Access your dashboard at: https://reffo.studio/dashboard-app/dashboard\n\nFor support, visit: https://reffo.studio/help`
  }),

  security: (userName: string, action: string, location?: string): EmailTemplate => ({
    subject: 'Security Alert - Account Activity',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Security Alert</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.7; color: #333; max-width: 600px; margin: 0 auto; padding: 24px; background-color: #ffffff;">
          ${getEmailHeader()}
          
          <div style="padding: 32px 0;">
            <h2 style="color: #000; margin: 0 0 24px 0; font-size: 24px; font-weight: 600;">Security Alert</h2>
            <p style="margin: 0 0 24px 0; font-size: 16px; color: #333;">Hello ${userName},</p>
            <p style="margin: 0 0 24px 0; font-size: 16px; color: #333;">We have detected new activity on your Reffo account:</p>
            
            <div style="background: #f8f8f8; border-left: 4px solid #000; padding: 20px; margin: 24px 0;">
              <p style="margin: 0 0 8px 0; font-size: 14px; color: #333;"><strong>Activity:</strong> ${action}</p>
              ${location ? `<p style="margin: 0 0 8px 0; font-size: 14px; color: #333;"><strong>Location:</strong> ${location}</p>` : ''}
              <p style="margin: 0; font-size: 14px; color: #333;"><strong>Time:</strong> ${new Date().toLocaleString()}</p>
            </div>
            
            <p style="margin: 0 0 32px 0; font-size: 16px; color: #333;">If this activity was authorized by you, no further action is required. If you do not recognize this activity, please review your account security settings immediately.</p>
            
            <div style="text-align: center; margin: 40px 0;">
              <a href="https://reffo.studio/dashboard-app/settings" style="background: #000; color: white; padding: 16px 32px; text-decoration: none; border-radius: 4px; display: inline-block; font-weight: 500; font-size: 16px;">Review Security Settings</a>
            </div>
          </div>
          
          ${getEmailFooter()}
        </body>
      </html>
    `,
    text: `Security Alert - ${action}\n\nHello ${userName}, we detected activity on your account. If this was not you, please review your security settings at: https://reffo.studio/dashboard-app/settings`
  }),

  billing: (userName: string, amount: string, nextBilling: string): EmailTemplate => ({
    subject: 'Payment Confirmation',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Payment Confirmation</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.7; color: #333; max-width: 600px; margin: 0 auto; padding: 24px; background-color: #ffffff;">
          ${getEmailHeader()}
          
          <div style="padding: 32px 0;">
            <h2 style="color: #000; margin: 0 0 24px 0; font-size: 24px; font-weight: 600;">Payment Confirmation</h2>
            <p style="margin: 0 0 24px 0; font-size: 16px; color: #333;">Hello ${userName},</p>
            <p style="margin: 0 0 24px 0; font-size: 16px; color: #333;">Your payment has been successfully processed. Thank you for your continued subscription to Reffo.</p>
            
            <div style="background: #f8f8f8; border-left: 4px solid #000; padding: 20px; margin: 24px 0;">
              <p style="margin: 0 0 8px 0; font-size: 14px; color: #333;"><strong>Amount Paid:</strong> ${amount}</p>
              <p style="margin: 0 0 8px 0; font-size: 14px; color: #333;"><strong>Payment Date:</strong> ${new Date().toLocaleDateString()}</p>
              <p style="margin: 0; font-size: 14px; color: #333;"><strong>Next Billing:</strong> ${nextBilling}</p>
            </div>
            
            <p style="margin: 0 0 32px 0; font-size: 16px; color: #333;">Your subscription remains active and you continue to have access to all premium features.</p>
            
            <div style="text-align: center; margin: 40px 0;">
              <a href="https://reffo.studio/dashboard-app/settings" style="background: #000; color: white; padding: 16px 32px; text-decoration: none; border-radius: 4px; display: inline-block; font-weight: 500; font-size: 16px;">Manage Subscription</a>
            </div>
          </div>
          
          ${getEmailFooter()}
        </body>
      </html>
    `,
    text: `Payment Confirmation - ${amount}\n\nHello ${userName}, your payment has been processed successfully. Next billing: ${nextBilling}\n\nManage subscription: https://reffo.studio/dashboard-app/settings`
  }),

  sharing: (userName: string, sharedBy: string, itemName: string, itemType: string): EmailTemplate => ({
    subject: `${sharedBy} shared content with you`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>New Share</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.7; color: #333; max-width: 600px; margin: 0 auto; padding: 24px; background-color: #ffffff;">
          ${getEmailHeader()}
          
          <div style="padding: 32px 0;">
            <h2 style="color: #000; margin: 0 0 24px 0; font-size: 24px; font-weight: 600;">New Content Shared</h2>
            <p style="margin: 0 0 24px 0; font-size: 16px; color: #333;">Hello ${userName},</p>
            <p style="margin: 0 0 24px 0; font-size: 16px; color: #333;"><strong>${sharedBy}</strong> has shared content with you on Reffo.</p>
            
            <div style="background: #f8f8f8; border-left: 4px solid #000; padding: 20px; margin: 24px 0;">
              <p style="margin: 0 0 8px 0; font-size: 14px; color: #333;"><strong>Content:</strong> ${itemName}</p>
              <p style="margin: 0; font-size: 14px; color: #333;"><strong>Type:</strong> ${itemType}</p>
            </div>
            
            <p style="margin: 0 0 32px 0; font-size: 16px; color: #333;">You can view and collaborate on this content in your Reffo dashboard.</p>
            
            <div style="text-align: center; margin: 40px 0;">
              <a href="https://reffo.studio/dashboard-app/dashboard" style="background: #000; color: white; padding: 16px 32px; text-decoration: none; border-radius: 4px; display: inline-block; font-weight: 500; font-size: 16px;">View Content</a>
            </div>
          </div>
          
          ${getEmailFooter()}
        </body>
      </html>
    `,
    text: `${sharedBy} shared ${itemName} with you on Reffo. View it at: https://reffo.studio/dashboard-app/dashboard`
  })
};

// Server-only functions (only available on server)
export async function sendEmail(data: EmailData): Promise<{ success: boolean; error?: string }> {
  // This function should only be called server-side
  if (typeof window !== 'undefined') {
    throw new Error('sendEmail can only be called server-side');
  }

  try {
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    
    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY environment variable is not set');
    }

    const result = await resend.emails.send({
      from: data.from || 'Reffo <noreply@reffo.studio>',
      to: data.to,
      subject: data.subject,
      html: data.html,
      text: data.text,
    });

    if (result.error) {
      console.error('Resend API error:', result.error);
      return { success: false, error: result.error.message };
    }

    return { success: true };

  } catch (error: any) {
    console.error('❌ Error sending email:', error);
    return { success: false, error: error.message };
  }
}

export async function sendTemplatedEmail(
  type: keyof typeof emailTemplates,
  to: string,
  templateData: any
): Promise<{ success: boolean; error?: string }> {
  // This function should only be called server-side
  if (typeof window !== 'undefined') {
    throw new Error('sendTemplatedEmail can only be called server-side');
  }

  try {
    let template;

    // Generate email content based on type
    switch (type) {
      case 'welcome':
        template = emailTemplates.welcome(templateData.userName);
        break;
      case 'security':
        template = emailTemplates.security(
          templateData.userName,
          templateData.action,
          templateData.location
        );
        break;
      case 'billing':
        template = emailTemplates.billing(
          templateData.userName,
          templateData.amount,
          templateData.nextBilling
        );
        break;
      case 'sharing':
        template = emailTemplates.sharing(
          templateData.userName,
          templateData.sharedBy,
          templateData.itemName,
          templateData.itemType
        );
        break;
      default:
        throw new Error(`Unsupported email template type: ${type}`);
    }

    return await sendEmail({
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });

  } catch (error: any) {
    console.error('❌ Error sending templated email:', error);
    return { success: false, error: error.message };
  }
} 