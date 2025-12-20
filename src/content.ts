interface TranscriptResult {
  success: boolean;
  filename?: string;
  fileSize?: number;
  error?: string;
}

interface AvailabilityCheckResult {
  available: boolean;
  reason?: string;
}

async function extractTranscript(): Promise<TranscriptResult> {
  try {
    let capturedDriveId = '';
    let capturedFileId = '';
    const capturedSiteUrl = `${window.location.protocol}//${window.location.host}`;

    const originalFetch = window.fetch.bind(window);

    // Intercept fetch requests to capture API information
    window.fetch = function(...args: Parameters<typeof fetch>) {
      const url = args[0].toString();

      if (url.includes('/media/transcripts') || url.includes('/items/')) {
        const driveMatch = url.match(/drives\/([^\/]+)/);
        const fileMatch = url.match(/items\/([^\/\?]+)/);

        if (driveMatch) capturedDriveId = driveMatch[1];
        if (fileMatch) capturedFileId = fileMatch[1];
      }

      return originalFetch.apply(this, args);
    };

    // Extract IDs from DOM if not captured from fetch
    if (!capturedDriveId || !capturedFileId) {
      const scripts = document.querySelectorAll('script');
      scripts.forEach((script) => {
        const content = script.textContent || '';

        const driveMatch = content.match(/drives\/b!([a-zA-Z0-9_-]+)/);
        if (driveMatch && !capturedDriveId) {
          capturedDriveId = 'b!' + driveMatch[1];
        }

        const fileMatch = content.match(/items\/([A-Z0-9]{20,})/);
        if (fileMatch && !capturedFileId) {
          capturedFileId = fileMatch[1];
        }
      });
    }

    if (!capturedDriveId || !capturedFileId) {
      console.error('[Teams Transcript Downloader] Failed to extract Drive ID or File ID');
      return {
        success: false,
        error: chrome.i18n.getMessage('errorDriveFileId')
      };
    }

    // Fetch transcript metadata
    const metadataUrl = `${capturedSiteUrl}/_api/v2.1/drives/${capturedDriveId}/items/${capturedFileId}?select=media/transcripts&$expand=media/transcripts`;

    const metadataResponse = await originalFetch(metadataUrl, {
      credentials: 'include',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!metadataResponse.ok) {
      console.error(`[Teams Transcript Downloader] Failed to fetch metadata: ${metadataResponse.status}`);
      throw new Error(chrome.i18n.getMessage('errorMetadata', [metadataResponse.status.toString()]));
    }

    const metadataData = await metadataResponse.json();
    const transcripts = metadataData.media?.transcripts || [];

    if (transcripts.length === 0) {
      console.error('[Teams Transcript Downloader] No transcript found');
      throw new Error(chrome.i18n.getMessage('errorNoTranscript'));
    }

    // Download VTT file with speaker information
    const transcript = transcripts[0];
    const originalUrl = transcript.temporaryDownloadUrl;

    // Modify URL to get VTT with speaker information:
    // /content or /streamContent?... → /streamContent?is=1&applymediaedits=false
    let modifiedUrl = originalUrl;

    if (modifiedUrl.includes('/content')) {
      modifiedUrl = modifiedUrl.replace(/\/content(\?.*)?$/, '/streamContent?is=1&applymediaedits=false');
    }
    else if (modifiedUrl.includes('/streamContent?')) {
      modifiedUrl = modifiedUrl.replace(/\/streamContent\?.*$/, '/streamContent?is=1&applymediaedits=false');
    }

    const vttResponse = await originalFetch(modifiedUrl, {
      credentials: 'include',
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache'
      }
    });

    if (!vttResponse.ok) {
      console.error(`[Teams Transcript Downloader] Failed to download VTT file: ${vttResponse.status}`);
      throw new Error(chrome.i18n.getMessage('errorDownloadVtt', [vttResponse.status.toString()]));
    }

    // Extract filename from Content-Disposition header
    let filename = 'transcript.vtt';
    const contentDisposition = vttResponse.headers.get('Content-Disposition');
    if (contentDisposition) {
      // Try to extract filename from Content-Disposition header
      const filenameStarMatch = contentDisposition.match(/filename\*=utf-8''([^;]+)/i);
      if (filenameStarMatch && filenameStarMatch[1]) {
        filename = decodeURIComponent(filenameStarMatch[1]);
      } else {
        // Fallback to regular filename parameter
        const filenameMatch = contentDisposition.match(/filename=["']?([^"';]+)["']?/i);
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1];
        }
      }
    }

    const vttContent = await vttResponse.text();

    const blob = new Blob([vttContent], { type: 'text/vtt;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Restore original fetch
    window.fetch = originalFetch;

    console.log(`[Teams Transcript Downloader] Successfully downloaded: ${filename} (${vttContent.length} characters)`);

    return {
      success: true,
      filename: filename,
      fileSize: vttContent.length
    };

  } catch (error) {
    console.error('[Teams Transcript Downloader] Error:', error);
    return {
      success: false,
      error: (error as Error).message
    };
  }
}

// Check if transcript is available
async function checkTranscriptAvailability(): Promise<AvailabilityCheckResult> {
  try {
    let capturedDriveId = '';
    let capturedFileId = '';
    const capturedSiteUrl = `${window.location.protocol}//${window.location.host}`;

    // Extract IDs from DOM
    const scripts = document.querySelectorAll('script');
    scripts.forEach((script) => {
      const content = script.textContent || '';

      const driveMatch = content.match(/drives\/b!([a-zA-Z0-9_-]+)/);
      if (driveMatch && !capturedDriveId) {
        capturedDriveId = 'b!' + driveMatch[1];
      }

      const fileMatch = content.match(/items\/([A-Z0-9]{20,})/);
      if (fileMatch && !capturedFileId) {
        capturedFileId = fileMatch[1];
      }
    });

    if (!capturedDriveId || !capturedFileId) {
      return {
        available: false,
        reason: chrome.i18n.getMessage('reasonNoDriveFileId')
      };
    }

    // Check if transcript metadata exists
    const metadataUrl = `${capturedSiteUrl}/_api/v2.1/drives/${capturedDriveId}/items/${capturedFileId}?select=media/transcripts&$expand=media/transcripts`;

    const metadataResponse = await fetch(metadataUrl, {
      credentials: 'include',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!metadataResponse.ok) {
      return {
        available: false,
        reason: chrome.i18n.getMessage('reasonMetadataFailed')
      };
    }

    const metadataData = await metadataResponse.json();
    const transcripts = metadataData.media?.transcripts || [];

    if (transcripts.length === 0) {
      return {
        available: false,
        reason: chrome.i18n.getMessage('errorNoTranscript')
      };
    }

    return { available: true };

  } catch (error) {
    console.error('[Teams Transcript Downloader] Availability check error:', error);
    return {
      available: false,
      reason: chrome.i18n.getMessage('reasonError', [(error as Error).message])
    };
  }
}

// Check transcript availability on page load
(async function checkOnLoad() {
  // Wait for page to fully load
  await new Promise(resolve => setTimeout(resolve, 2000));

  const result = await checkTranscriptAvailability();

  // Send result to background script
  chrome.runtime.sendMessage({
    action: 'updateAvailability',
    available: result.available,
    reason: result.reason
  });
})();

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, _, sendResponse) => {
  if (request.action === 'downloadTranscript') {
    extractTranscript().then(result => {
      sendResponse(result);
    });
    return true; // Indicates async response
  } else if (request.action === 'checkAvailability') {
    checkTranscriptAvailability().then(result => {
      sendResponse(result);
    });
    return true; // Indicates async response
  }
});
