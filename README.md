# Discord Batch File Uploader — Tampermonkey Script

A fully automatic userscript that intelligently batches large file uploads on Discord to avoid size limit errors. Drag all your files once, and the script handles the rest!

## ✨ Features

### Core Functionality
- **🎯 Fully Automatic** - Drag files once, batches are automatically uploaded and sent
- **🧠 Intelligent Batching** - Uses First Fit Decreasing bin packing algorithm to minimize batch count
- **📊 Manual Tier Selection** - Choose your Discord tier (Free/Nitro Classic/Nitro Basic/Nitro)
- **🔒 Channel Locking** - Uploads pause if you switch channels (resume on return or cancel)
- **⚡ Fast Processing** - Concurrent upload support with configurable delays (100-2000ms)

### User Interface
- **⚙️ Settings Panel** - Persistent button in bottom-right corner
- **📦 Batch Preview** - See how files will be grouped before uploading
- **📈 Progress Indicator** - Real-time progress bar with percentage
- **⏸️ Pause/Resume** - Automatic pause when switching channels
- **🎨 Professional UI** - Clean, modern design matching Discord's aesthetic

### Customization
- **🔧 Enable/Disable** - Toggle script on/off without uninstalling
- **🎚️ Adjustable Delays** - Configure delay between batches (100-2000ms)
- **💬 Custom Messages** - Format batch messages with variables: `{index}`, `{total}`, `{count}`, `{size}`
- **🔔 Notifications** - Optional completion notifications
- **💾 Persistent Settings** - All preferences saved to localStorage

## 📥 Installation

### Prerequisites
- [Tampermonkey](https://www.tampermonkey.net/) browser extension
- Discord account (Free, Nitro Basic, or Nitro)

### Steps
1. **Install Tampermonkey** for your browser:
   - [Chrome](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
   - [Firefox](https://addons.mozilla.org/en-US/firefox/addon/tampermonkey/)
   - [Edge](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd)
   - [Safari](https://apps.apple.com/us/app/tampermonkey/id1482490089)

2. **Install the script**:
   - Click on [discord-batch-uploader.user.js](discord-batch-uploader.user.js)
   - Click the "Raw" button or copy the contents
   - Tampermonkey will detect it and prompt you to install
   - Click "Install"

3. **Start using**:
   - Navigate to Discord in your browser
   - Look for the "Batch Uploader" button in the bottom-right corner
   - Drag files and enjoy automatic batching!

## 🚀 Usage

### Basic Upload
1. **Drag files** into any Discord channel (or paste them)
2. If files exceed limits, a **batch preview modal** appears
3. Review batches and adjust Discord tier if needed
4. Click **"Start Batch Upload"**
5. Watch as batches are automatically uploaded and sent! ✨

### Settings Configuration
Click the **"Batch Uploader"** button (bottom-right) to access settings:

| Setting | Description | Default |
|---------|-------------|---------|
| **Enable Batch Uploader** | Turn script on/off | ✅ Enabled |
| **Your Discord Tier** | Select your tier manually | 💎 Nitro (500 MB) |
| **Delay Between Batches** | Wait time between uploads | ⚡ 300ms |
| **Show Notifications** | Display completion messages | ✅ Enabled |
| **Batch Message Format** | Customize message text | `📦 Batch {index}/{total} • {count} files • {size} MB` |

### Message Format Variables
Customize your batch messages with these variables:
- `{index}` - Current batch number
- `{total}` - Total number of batches
- `{count}` - Number of files in this batch
- `{size}` - Total size of files in this batch (MB)

**Example formats:**
- Default: `📦 Batch {index}/{total} • {count} files • {size} MB`
- Simple: `Batch {index}/{total}`
- Detailed: `Upload {index} of {total} - {count} files ({size} MB)`

## 📊 Discord Upload Limits

| Tier | Per-File Limit | Per-Message Limit | Files Per Message |
|------|----------------|-------------------|-------------------|
| **Free** | 25 MB | 25 MB | 10 |
| **Nitro Classic** | 50 MB | 50 MB | 10 |
| **Nitro Basic** | 50 MB | 50 MB | 10 |
| **Nitro** | 500 MB | 500 MB | 10 |

Select your tier in the settings or batch preview modal to ensure correct file batching.

## 🎯 How It Works

### Intelligent Batching Algorithm
1. **Files are sorted** by size (largest first)
2. **First Fit Decreasing** bin packing algorithm places files into batches
3. **Minimizes batch count** while respecting Discord limits
4. **Skips oversized files** with clear warnings

### Example
Uploading 13 files (4.5 GB total) with Nitro:
- **Without optimization**: ~10 batches
- **With FFD algorithm**: ~7-8 batches (30% reduction!)

### Channel Locking
When uploading starts:
- 🔒 **Channel ID is captured**
- If you switch channels → ⏸️ **Upload pauses** with notification
- Return to channel → ▶️ **Upload resumes** automatically
- Or click **"Cancel Upload"** to abort

## 🔧 Troubleshooting

### Files not uploading
- Check console logs (F12) for errors
- Verify Discord is fully loaded before dragging files
- Try refreshing the page and dragging again

### Settings not saving
- Check if localStorage is enabled in your browser
- Try clearing site data and reconfiguring

### Script not detecting files
- Ensure script is enabled in Tampermonkey
- Check if "Enable Batch Uploader" is toggled on in settings
- Verify files exceed Discord limits (script only intercepts oversized uploads)

### Progress indicator stuck
- If upload stalls, cancel and restart
- Check network connection
- Try reducing batch delay in settings

## 🛡️ Privacy & Security

- ✅ **Runs locally** in your browser
- ✅ **No external servers** - all processing is client-side
- ✅ **No API calls** - doesn't access Discord's API
- ✅ **Open source** - review the code before use
- ✅ **No data collection** - settings stored locally only

## 📝 Version History

### v1.0.0 (Current)
- ✨ Initial Tampermonkey script release
- 🎯 Fully automatic batch uploading
- 🧠 Intelligent bin packing algorithm
- 🔒 Channel locking with pause/resume
- ⚙️ Comprehensive settings panel
- 📊 Real-time progress tracking
- 💾 Persistent settings storage

## 🤝 Contributing

Found a bug or have a feature request? Please:
1. Check existing issues
2. Open a new issue with details
3. Include console logs if reporting bugs

## 📄 License

This project is provided as-is for personal use. Review Discord's Terms of Service before use.

## ⚠️ Disclaimer

This userscript interacts with Discord's web interface. While it uses standard web APIs and doesn't violate Discord's TOS, use at your own discretion. The authors are not responsible for any account issues.

---

**Made with ❤️ for the Discord community**
