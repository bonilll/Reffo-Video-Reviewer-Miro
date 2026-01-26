// Background email processor that runs every 30 seconds
let processingInterval: NodeJS.Timeout | null = null;
let isProcessing = false;

const PROCESSING_INTERVAL = 30 * 1000; // 30 seconds

async function processEmailQueue() {
  if (isProcessing) {
    console.log('⏭️ Email processing already in progress, skipping...');
    return;
  }

  isProcessing = true;

  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/email/process-auto`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Reffo-Email-Background-Processor'
      }
    });

    const result = await response.json();
    
    if (result.success && result.summary.total > 0) {
      console.log(`✅ Background processed ${result.summary.sent} emails, ${result.summary.failed} failed`);
    }
  } catch (error: any) {
    console.error('❌ Background email processing error:', error);
  } finally {
    isProcessing = false;
  }
}

export function startEmailProcessor() {
  if (processingInterval) {
    console.log('📧 Email processor already running');
    return;
  }

  console.log('🚀 Starting background email processor (every 30 seconds)');
  
  // Process immediately on start
  processEmailQueue();
  
  // Then process every 30 seconds
  processingInterval = setInterval(processEmailQueue, PROCESSING_INTERVAL);
}

export function stopEmailProcessor() {
  if (processingInterval) {
    clearInterval(processingInterval);
    processingInterval = null;
    console.log('🛑 Email processor stopped');
  }
}

export function isEmailProcessorRunning() {
  return processingInterval !== null;
}

// Auto-start in non-browser environments (server-side)
if (typeof window === 'undefined') {
  startEmailProcessor();
} 