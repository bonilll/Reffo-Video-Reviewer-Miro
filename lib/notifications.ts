import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { emailTemplates } from "./email";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export interface NotificationData {
  userId: string;
  email: string;
  type: 'security' | 'billing' | 'sharing' | 'comments' | 'updates' | 'marketing' | 'welcome' | 'password_reset';
  templateData: any;
}

// Queue a notification email
export async function queueNotification(data: NotificationData, authToken?: string) {
  try {
    if (authToken) {
      convex.setAuth(authToken);
    }

    let template;
    let subject = '';
    let htmlContent = '';
    let textContent = '';

    // Generate email content based on type
    switch (data.type) {
      case 'welcome':
        template = emailTemplates.welcome(data.templateData.userName);
        break;
      case 'security':
        template = emailTemplates.security(
          data.templateData.userName,
          data.templateData.action,
          data.templateData.location
        );
        break;
      case 'billing':
        template = emailTemplates.billing(
          data.templateData.userName,
          data.templateData.amount,
          data.templateData.nextBilling
        );
        break;
      case 'sharing':
        template = emailTemplates.sharing(
          data.templateData.userName,
          data.templateData.sharedBy,
          data.templateData.itemName,
          data.templateData.itemType
        );
        break;
      default:
        throw new Error(`Unsupported notification type: ${data.type}`);
    }

    subject = template.subject;
    htmlContent = template.html;
    textContent = template.text;

    // Queue the email in Convex
    const result = await convex.mutation(api.notifications.queueEmail, {
      userId: data.userId,
      email: data.email,
      type: data.type,
      subject,
      htmlContent,
      textContent,
      templateData: data.templateData,
    });

    return result;

  } catch (error) {
    console.error('Error queueing notification:', error);
    throw error;
  }
}

// Send welcome email to new users
export async function sendWelcomeEmail(userId: string, email: string, userName: string, authToken?: string) {
  return queueNotification({
    userId,
    email,
    type: 'welcome',
    templateData: { userName }
  }, authToken);
}

// Send security alert
export async function sendSecurityAlert(
  userId: string, 
  email: string, 
  userName: string, 
  action: string, 
  location?: string,
  authToken?: string
) {
  return queueNotification({
    userId,
    email,
    type: 'security',
    templateData: { userName, action, location }
  }, authToken);
}

// Send billing confirmation
export async function sendBillingConfirmation(
  userId: string,
  email: string,
  userName: string,
  amount: string,
  nextBilling: string,
  authToken?: string
) {
  return queueNotification({
    userId,
    email,
    type: 'billing',
    templateData: { userName, amount, nextBilling }
  }, authToken);
}

// Send sharing notification
export async function sendSharingNotification(
  userId: string,
  email: string,
  userName: string,
  sharedBy: string,
  itemName: string,
  itemType: string,
  authToken?: string
) {
  return queueNotification({
    userId,
    email,
    type: 'sharing',
    templateData: { userName, sharedBy, itemName, itemType }
  }, authToken);
}

// Process email queue (to be called by cron job or webhook)
export async function processEmailQueue(authKey: string) {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/email/process`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to process email queue');
    }

    const result = await response.json();
    return result;

  } catch (error) {
    console.error('Error processing email queue:', error);
    throw error;
  }
}

export const queueWelcomeEmail = async (email: string, firstName?: string) => {
  try {
    const response = await fetch('/api/test-queue-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        type: 'welcome',
        firstName: firstName || 'User'
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to queue welcome email: ${response.status}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('❌ Error queueing welcome email:', error);
    throw error;
  }
};

export const queueSharingEmail = async (email: string, data: {
  userId?: string;
  userName?: string;
  sharedBy: string;
  itemType: string;
  itemName: string;
  role: string;
  boardId?: string;
}) => {
  try {
    const response = await fetch('/api/email/queue', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        type: 'sharing',
        data
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to queue sharing email: ${response.status}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('❌ Error queueing sharing email:', error);
    throw error;
  }
};

export const queueSecurityEmail = async (email: string, data: {
  userName?: string;
  event: string;
  details: string;
}) => {
  try {
    const response = await fetch('/api/email/queue', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        type: 'security',
        data
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to queue security email: ${response.status}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('❌ Error queueing security email:', error);
    throw error;
  }
};

export const queueBillingEmail = async (email: string, data: {
  userName?: string;
  event: string;
  amount?: string;
  plan?: string;
}) => {
  try {
    const response = await fetch('/api/email/queue', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        type: 'billing',
        data
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to queue billing email: ${response.status}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('❌ Error queueing billing email:', error);
    throw error;
  }
}; 