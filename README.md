# Teams Transcript Downloader / Teams トランスクリプトダウンローダー

[English](#english) | [日本語](#japanese)

---

<a name="english"></a>
## English

A Chrome extension that allows you to download transcripts (subtitles) from Microsoft Teams recorded videos as VTT files.

### Features

- Download transcripts with a single click on the extension button from Teams recording pages
- Save in VTT format with speaker information
- **Smart icon status**: The extension icon automatically indicates availability
  - **Colored icon**: Transcript is available for download
  - **Grayed-out icon**: Transcript is not available (hover to see the reason)
- Built with TypeScript + Vite + Vanilla JS

### How It Works

The extension automatically checks if transcripts are available:

1. **URL Check**: Only works on `https://*.sharepoint.com/*/stream.aspx*` pages
2. **Transcript Check**: Upon page load, the extension checks if transcript metadata exists
3. **Visual Feedback**: The icon reflects the availability status in real-time

### Build Instructions

1. Install dependencies

```bash
pnpm install
```

2. Build the extension

```bash
pnpm build
```

The build output will be generated in the `dist` directory.

### Chrome Extension Installation

1. Open `chrome://extensions/` in Chrome
2. Enable "Developer mode" in the top right corner
3. Click "Load unpacked"
4. Select the `dist` directory generated from the build

### Usage

1. Navigate to a Microsoft Teams recorded video page
2. Wait for the page to fully load
3. Check the extension icon status:
   - **Colored icon**: Click to download the transcript
   - **Grayed-out icon**: Transcript is not available
4. The VTT file will be automatically downloaded

### Development

Run in development mode:

```bash
pnpm dev
```

### Important Notes

- This extension only works on Teams recording pages hosted on SharePoint (`*.sharepoint.com/*/stream.aspx*`)
- The extension will not work if no transcript exists for the recording
- The icon status updates automatically after the page loads (approximately 2 seconds)
- Hover over the grayed-out icon to see why the transcript is unavailable

### Technical Details

- **Manifest Version**: 3
- **Content Scripts**: Automatically injected on matching SharePoint URLs
- **Background Service Worker**: Manages icon states and availability checks
- **Permissions**: `activeTab`, `scripting`, and `https://*.sharepoint.com/*`

### License

MIT

---

<a name="japanese"></a>
## 日本語

Microsoft Teamsの録画ビデオに付いているトランスクリプト(字幕)をVTTファイルとしてダウンロードするChrome拡張機能です。

### 機能

- Teamsの録画ページで拡張機能ボタンをクリックするだけでトランスクリプトをダウンロード
- VTT形式で保存(話者情報付き)
- **スマートアイコン表示**: 拡張機能のアイコンが自動的に利用可能状態を表示
  - **カラーアイコン**: トランスクリプトがダウンロード可能
  - **グレーアイコン**: トランスクリプトが利用不可（ホバーで理由を表示）
- TypeScript + Vite + Vanilla JSで構築

### 動作の仕組み

拡張機能は自動的にトランスクリプトの利用可否をチェックします：

1. **URLチェック**: `https://*.sharepoint.com/*/stream.aspx*` のページでのみ動作
2. **トランスクリプトチェック**: ページ読み込み時にトランスクリプトメタデータの存在を確認
3. **視覚的フィードバック**: アイコンがリアルタイムで利用可否を反映

### ビルド方法

1. 依存パッケージをインストール

```bash
pnpm install
```

2. ビルド

```bash
pnpm build
```

ビルドが完了すると、`dist`ディレクトリに拡張機能のファイルが生成されます。

### Chrome拡張機能のインストール方法

1. Chromeで `chrome://extensions/` を開く
2. 右上の「デベロッパーモード」をオンにする
3. 「パッケージ化されていない拡張機能を読み込む」をクリック
4. ビルドで生成された `dist` ディレクトリを選択

### 使い方

1. Microsoft Teamsの録画ビデオのページを開く
2. ページが完全に読み込まれるまで待つ
3. 拡張機能のアイコンの状態を確認：
   - **カラーアイコン**: クリックしてトランスクリプトをダウンロード
   - **グレーアイコン**: トランスクリプトは利用できません
4. VTTファイルが自動的にダウンロードされます

### 開発

開発モードで起動:

```bash
pnpm dev
```

### 注意事項

- この拡張機能はSharePoint上のTeams録画ページ（`*.sharepoint.com/*/stream.aspx*`）でのみ動作します
- トランスクリプトが存在しない録画では動作しません
- アイコンの状態はページ読み込み後（約2秒後）に自動的に更新されます
- グレーアウトされたアイコンにホバーすると、利用できない理由が表示されます

### 技術詳細

- **マニフェストバージョン**: 3
- **Content Scripts**: マッチするSharePoint URLに自動注入
- **Background Service Worker**: アイコン状態と利用可否チェックを管理
- **権限**: `activeTab`、`scripting`、`https://*.sharepoint.com/*`

### ライセンス

MIT
