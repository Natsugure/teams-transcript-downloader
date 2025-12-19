// Teams トランスクリプト取得 Content Script

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
  console.group('=== トランスクリプト取得テスト ===');

  try {
    // ステップ1: fetchをインターセプトしてAPIの情報をキャプチャ
    console.log('ステップ1: ページからAPI情報を取得中...');

    let capturedDriveId = '';
    let capturedFileId = '';
    const capturedSiteUrl = `${window.location.protocol}//${window.location.host}`;

    // originalFetchを最初に保存（インターセプト前）
    const originalFetch = window.fetch.bind(window);

    // 既存のfetchリクエストからキャプチャ
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

    // 既存のスクリプトやページ要素からIDを抽出する試み
    if (!capturedDriveId || !capturedFileId) {
      console.log('  DOMから検索中...');

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
      console.warn('⚠ Drive IDまたはFile IDが見つかりません');
      console.log('解決策: ページを再読み込みしてから、このスクリプトをもう一度実行してください');
      console.groupEnd();
      return {
        success: false,
        error: 'Drive IDまたはFile IDが見つかりません。ページを再読み込みしてから再度お試しください。'
      };
    }

    console.log('✓ Drive ID:', capturedDriveId);
    console.log('✓ File ID:', capturedFileId);

    // ステップ2: トランスクリプトのメタデータを取得
    console.log('\nステップ2: トランスクリプトのメタデータを取得中...');

    const metadataUrl = `${capturedSiteUrl}/_api/v2.1/drives/${capturedDriveId}/items/${capturedFileId}?select=media/transcripts&$expand=media/transcripts`;

    const metadataResponse = await originalFetch(metadataUrl, {
      credentials: 'include',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!metadataResponse.ok) {
      throw new Error(`メタデータの取得に失敗: ${metadataResponse.status}`);
    }

    const metadataData = await metadataResponse.json();
    const transcripts = metadataData.media?.transcripts || [];

    if (transcripts.length === 0) {
      throw new Error('トランスクリプトが見つかりませんでした');
    }

    console.log(`✓ ${transcripts.length}件のトランスクリプトを発見`);

    // ステップ3: VTTファイルをダウンロード（話者情報付き）
    console.log('\nステップ3: VTTファイルをダウンロード中...');

    const transcript = transcripts[0];
    const originalUrl = transcript.temporaryDownloadUrl;

    // URLを修正:
    // - /content (クエリパラメータあり/なし) → /streamContent?is=1&applymediaedits=false
    // - /streamContent?tempauth=... → /streamContent?is=1&applymediaedits=false
    let modifiedUrl = originalUrl;

    // /content で終わる、または /content?... の場合
    if (modifiedUrl.includes('/content')) {
      modifiedUrl = modifiedUrl.replace(/\/content(\?.*)?$/, '/streamContent?is=1&applymediaedits=false');
    }
    // /streamContent?... の場合（クエリパラメータを全て置き換え）
    else if (modifiedUrl.includes('/streamContent?')) {
      modifiedUrl = modifiedUrl.replace(/\/streamContent\?.*$/, '/streamContent?is=1&applymediaedits=false');
    }

    console.log('  元のURL:', originalUrl);
    console.log('  修正後URL:', modifiedUrl);

    const vttResponse = await originalFetch(modifiedUrl, {
      credentials: 'include',
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache'
      }
    });

    if (!vttResponse.ok) {
      throw new Error(`VTTファイルのダウンロードに失敗: ${vttResponse.status}`);
    }

    const vttContent = await vttResponse.text();
    console.log('✓ VTTファイルダウンロード成功');
    console.log(`  ファイルサイズ: ${vttContent.length}文字`);
    console.log('  最初の200文字:', vttContent.substring(0, 200));

    // ステップ4: そのままファイルとしてダウンロード
    console.log('\nステップ4: ファイルをダウンロード中...');

    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `teams-transcript-${timestamp}.vtt`;

    const blob = new Blob([vttContent], { type: 'text/vtt;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log(`✓ ダウンロード完了: ${filename}`);

    console.log('\n✓✓✓ すべてのステップが成功しました！ ✓✓✓');
    console.groupEnd();

    // fetchのインターセプトを解除
    window.fetch = originalFetch;

    return {
      success: true,
      filename: filename,
      fileSize: vttContent.length
    };

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    console.error('  メッセージ:', (error as Error).message);
    console.groupEnd();

    return {
      success: false,
      error: (error as Error).message
    };
  }
}

// トランスクリプトが利用可能かチェックする関数
async function checkTranscriptAvailability(): Promise<AvailabilityCheckResult> {
  try {
    let capturedDriveId = '';
    let capturedFileId = '';
    const capturedSiteUrl = `${window.location.protocol}//${window.location.host}`;

    // DOMからIDを抽出
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
        reason: 'Drive IDまたはFile IDが見つかりません'
      };
    }

    // メタデータを取得してトランスクリプトの有無を確認
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
        reason: 'メタデータの取得に失敗しました'
      };
    }

    const metadataData = await metadataResponse.json();
    const transcripts = metadataData.media?.transcripts || [];

    if (transcripts.length === 0) {
      return {
        available: false,
        reason: 'トランスクリプトが見つかりません'
      };
    }

    return { available: true };

  } catch (error) {
    return {
      available: false,
      reason: `エラー: ${(error as Error).message}`
    };
  }
}

// ページロード時にトランスクリプトの可用性をチェック
(async function checkOnLoad() {
  // ページが完全に読み込まれるまで少し待つ
  await new Promise(resolve => setTimeout(resolve, 2000));

  const result = await checkTranscriptAvailability();

  // background scriptに結果を送信
  chrome.runtime.sendMessage({
    action: 'updateAvailability',
    available: result.available,
    reason: result.reason
  });

  console.log('トランスクリプト可用性チェック:', result);
})();

// background scriptからのメッセージを受信
chrome.runtime.onMessage.addListener((request, _, sendResponse) => {
  if (request.action === 'downloadTranscript') {
    extractTranscript().then(result => {
      sendResponse(result);
    });
    return true; // 非同期レスポンスを示す
  } else if (request.action === 'checkAvailability') {
    checkTranscriptAvailability().then(result => {
      sendResponse(result);
    });
    return true; // 非同期レスポンスを示す
  }
});
