// ==UserScript==
// @name         Discord Batch File Uploader
// @namespace    https://github.com/Wk4021/Discord-Batch-Uploader
// @version      1.0.0
// @description  Automatically batch large file uploads on Discord to avoid size limit errors
// @author       AACC
// @match        https://discord.com/channels/*
// @match        https://ptb.discord.com/channels/*
// @match        https://canary.discord.com/channels/*
// @icon         https://discord.com/assets/f9bb9c4af2b9c32a2c5ee0014661546d.png
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    console.log('[Discord Batch Uploader] Script loaded');

    // ==================== STATE ====================
    const STATE = {
        limits: null,
        batches: [],
        skipped: [],
        currentBatchIndex: 0,
        uploadChannelId: null, // Channel where upload was started
        isPaused: false,
        settings: {
            enableScript: true,
            defaultTier: '2', // Default to Nitro (500MB)
            showNotifications: true,
            delayBetweenBatches: 300, // ms
            batchMessageFormat: '📦 Batch {index}/{total} • {count} files • {size} MB'
        }
    };

    // Load settings from localStorage
    function loadSettings() {
        try {
            const saved = localStorage.getItem('dbu-settings');
            if (saved) {
                const parsed = JSON.parse(saved);
                STATE.settings = { ...STATE.settings, ...parsed };
                console.log('[Discord Batch Uploader] Settings loaded:', STATE.settings);
            }
        } catch (e) {
            console.warn('[Discord Batch Uploader] Failed to load settings:', e);
        }
    }

    // Save settings to localStorage
    function saveSettings() {
        try {
            localStorage.setItem('dbu-settings', JSON.stringify(STATE.settings));
            console.log('[Discord Batch Uploader] Settings saved');
        } catch (e) {
            console.warn('[Discord Batch Uploader] Failed to save settings:', e);
        }
    }

    const DEFAULT_LIMITS = {
        tier: "Auto (Nitro assumed)",
        perFileMB: 500,  // Assume Nitro limits by default to avoid skipping files
        perMessageTotalMB: 500,
        maxFilesPerMessage: 10
    };

    // ==================== HELPER FUNCTIONS ====================
    function bytesToMB(n) { return Math.round((n / (1024 * 1024)) * 10) / 10; }
    function mbToBytes(mb) { return Math.floor(mb * 1024 * 1024); }
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    function getCurrentChannelId() {
        // Extract channel ID from URL: /channels/guildId/channelId
        const match = window.location.pathname.match(/\/channels\/\d+\/(\d+)/);
        return match ? match[1] : null;
    }

    function isInCorrectChannel() {
        if (!STATE.uploadChannelId) return true;
        return getCurrentChannelId() === STATE.uploadChannelId;
    }

    // ==================== TIER LIMITS ====================
    function limitsForPremiumType(pt) {
        switch (pt) {
            case '2': // Nitro
                return { tier: "Nitro", perFileMB: 500, perMessageTotalMB: 500, maxFilesPerMessage: 10 };
            case '3': // Nitro Basic
                return { tier: "Nitro Basic", perFileMB: 50, perMessageTotalMB: 50, maxFilesPerMessage: 10 };
            case '1': // Classic
                return { tier: "Nitro Classic", perFileMB: 50, perMessageTotalMB: 50, maxFilesPerMessage: 10 };
            case '0':
            default:
                return { tier: "Free", perFileMB: 25, perMessageTotalMB: 25, maxFilesPerMessage: 10 };
        }
    }

    // ==================== BATCHING LOGIC ====================
    function prepareBatches(files) {
        const L = STATE.limits || DEFAULT_LIMITS;
        const perFileBytes = mbToBytes(L.perFileMB);
        const perMsgBytes = mbToBytes(L.perMessageTotalMB);
        const maxCount = L.maxFilesPerMessage || 10;

        const good = [];
        const skipped = [];

        for (const f of files) {
            if (f.size > perFileBytes) {
                skipped.push({ file: f, reason: `Exceeds per-file cap (${bytesToMB(f.size)}MB > ${L.perFileMB}MB)` });
            } else {
                good.push(f);
            }
        }

        // Intelligent batching using First Fit Decreasing bin packing algorithm
        // Sort files by size (largest first) for better packing efficiency
        good.sort((a, b) => b.size - a.size);

        const batches = [];

        for (const file of good) {
            let placed = false;

            // Try to fit the file into an existing batch
            for (const batch of batches) {
                const batchSize = batch.reduce((sum, f) => sum + f.size, 0);
                const wouldSize = batchSize + file.size;
                const wouldCount = batch.length + 1;

                // Check if file fits in this batch
                if (wouldCount <= maxCount && wouldSize <= perMsgBytes) {
                    batch.push(file);
                    placed = true;
                    break;
                }
            }

            // If file doesn't fit in any existing batch, create a new batch
            if (!placed) {
                batches.push([file]);
            }
        }

        STATE.batches = batches;
        STATE.skipped = skipped;
        STATE.currentBatchIndex = 0;

        console.log('[Discord Batch Uploader] Prepared', batches.length, 'batches,', skipped.length, 'skipped (using intelligent bin packing)');
    }

    // ==================== UI COMPONENTS ====================
    function showBatchModal(files) {
        const totalSize = files.reduce((sum, f) => sum + f.size, 0);

        const modal = document.createElement('div');
        modal.id = 'dbu-batch-modal';
        modal.style.cssText = `
            position: fixed; inset: 0; z-index: 9999999;
            background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        `;

        modal.innerHTML = `
            <div style="background: linear-gradient(135deg, #2c2f33 0%, #23272a 100%); color: #fff; padding: 24px; border-radius: 16px; max-width: 600px; max-height: 80vh; overflow-y: auto; box-shadow: 0 8px 32px rgba(0,0,0,0.5)">
                <h2 style="margin: 0 0 8px 0; color: #5865F2; display: flex; align-items: center; gap: 10px">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                    </svg>
                    Files Exceed Discord Limits
                </h2>
                <p id="dbu-summary" style="margin: 0 0 16px 0; opacity: 0.8; line-height: 1.6">
                    Your ${files.length} files (${bytesToMB(totalSize)} MB) will be automatically batched and uploaded in ${STATE.batches.length} message(s).
                </p>

                <div style="background: rgba(88,101,242,.15); border: 1px solid rgba(88,101,242,.3); padding: 14px; border-radius: 8px; margin-bottom: 16px">
                    <label style="display: block; margin-bottom: 8px; font-size: 13px; font-weight: 600">
                        Select Your Discord Tier:
                    </label>
                    <select id="dbu-tier-select" style="width: 100%; padding: 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,.2); background: rgba(0,0,0,.3); color: #fff; font-size: 14px; cursor: pointer; font-weight: 500">
                        <option value="2" ${STATE.limits?.tier?.includes('Nitro') && !STATE.limits?.tier?.includes('Basic') ? 'selected' : ''}>Nitro (500 MB per file)</option>
                        <option value="3" ${STATE.limits?.tier?.includes('Basic') ? 'selected' : ''}>Nitro Basic (50 MB per file)</option>
                        <option value="1">Nitro Classic (50 MB per file)</option>
                        <option value="0" ${STATE.limits?.tier?.includes('Free') ? 'selected' : ''}>Free (25 MB per file)</option>
                    </select>
                    <div id="dbu-tier-info" style="margin-top: 8px; font-size: 12px; opacity: 0.7">
                        Per-file: ${STATE.limits?.perFileMB || 500} MB • Per-message: ${STATE.limits?.perMessageTotalMB || 500} MB
                    </div>
                </div>

                <div id="dbu-skipped" style="background: rgba(237,66,69,.15); border: 1px solid rgba(237,66,69,.3); padding: 12px; border-radius: 8px; margin-bottom: 16px; ${STATE.skipped.length > 0 ? '' : 'display: none;'}">
                    <strong style="color: #ed4245">⚠️ ${STATE.skipped.length} file(s) too large and will be skipped</strong>
                </div>

                <div style="background: rgba(0,0,0,0.3); padding: 16px; border-radius: 10px; margin-bottom: 16px">
                    <h3 style="margin: 0 0 12px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.7">Batches</h3>
                    <div id="dbu-batches-container">
                        <div style="display: flex; flex-direction: column; gap: 8px; max-height: 300px; overflow-y: auto">
                            ${STATE.batches.map((batch, i) => {
                                const batchSize = bytesToMB(batch.reduce((sum, f) => sum + f.size, 0));
                                return `
                                    <div style="background: rgba(0,0,0,0.3); padding: 10px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.06)">
                                        <div style="font-weight: 600; margin-bottom: 4px">Batch ${i+1} • ${batch.length} files • ${batchSize} MB</div>
                                        <div style="font-size: 11px; opacity: 0.6; font-family: monospace">${batch.slice(0, 3).map(f => f.name).join(', ')}${batch.length > 3 ? ` +${batch.length - 3} more` : ''}</div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                </div>

                <div style="background: rgba(88,101,242,.1); border: 1px solid rgba(88,101,242,.2); padding: 12px; border-radius: 8px; margin-bottom: 16px; font-size: 13px; line-height: 1.5; opacity: 0.9">
                    ℹ️ Files will be automatically uploaded and sent in separate messages with batch information.
                </div>

                <div style="display: flex; gap: 10px">
                    <button id="dbu-modal-start" style="flex: 1; padding: 14px; background: #5865F2; color: #fff; border: none; border-radius: 10px; font-weight: 600; font-size: 15px; cursor: pointer; transition: all .2s">
                        Start Batch Upload
                    </button>
                    <button id="dbu-modal-cancel" style="padding: 14px 20px; background: rgba(237,66,69,.15); color: #ed4245; border: 1px solid rgba(237,66,69,.3); border-radius: 10px; font-weight: 600; cursor: pointer">
                        Cancel
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Tier selector change handler
        modal.querySelector('#dbu-tier-select').addEventListener('change', (e) => {
            const premiumType = parseInt(e.target.value);
            STATE.limits = limitsForPremiumType(premiumType);
            console.log('[Discord Batch Uploader] Tier changed to:', STATE.limits.tier);

            // Re-prepare batches with new limits
            prepareBatches(files);

            // Update the info display
            const infoEl = modal.querySelector('#dbu-tier-info');
            infoEl.textContent = `Per-file: ${STATE.limits.perFileMB} MB • Per-message: ${STATE.limits.perMessageTotalMB} MB`;

            // Update batch display
            const batchContainer = modal.querySelector('#dbu-batches-container');
            batchContainer.innerHTML = `
                <div style="display: flex; flex-direction: column; gap: 8px; max-height: 300px; overflow-y: auto">
                    ${STATE.batches.map((batch, i) => {
                        const batchSize = bytesToMB(batch.reduce((sum, f) => sum + f.size, 0));
                        return `
                            <div style="background: rgba(0,0,0,0.3); padding: 10px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.06)">
                                <div style="font-weight: 600; margin-bottom: 4px">Batch ${i+1} • ${batch.length} files • ${batchSize} MB</div>
                                <div style="font-size: 11px; opacity: 0.6; font-family: monospace">${batch.slice(0, 3).map(f => f.name).join(', ')}${batch.length > 3 ? ` +${batch.length - 3} more` : ''}</div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;

            // Update summary text
            const summaryEl = modal.querySelector('#dbu-summary');
            summaryEl.textContent = `Your ${files.length} files (${bytesToMB(totalSize)} MB) will be automatically batched and uploaded in ${STATE.batches.length} message(s).`;

            // Update skipped warning
            const skippedEl = modal.querySelector('#dbu-skipped');
            if (STATE.skipped.length > 0) {
                skippedEl.style.display = 'block';
                skippedEl.innerHTML = `<strong style="color: #ed4245">⚠️ ${STATE.skipped.length} file(s) too large and will be skipped</strong>`;
            } else {
                skippedEl.style.display = 'none';
            }
        });

        modal.querySelector('#dbu-modal-start').addEventListener('click', async () => {
            modal.remove();
            await startBatchUpload();
        });

        modal.querySelector('#dbu-modal-cancel').addEventListener('click', () => {
            modal.remove();
            STATE.batches = [];
        });
    }

    // ==================== DISCORD DOM HELPERS ====================
    function findFileInput() {
        // Discord's file input is typically hidden with type="file"
        const inputs = document.querySelectorAll('input[type="file"]');
        for (const input of inputs) {
            if (input.multiple) return input;
        }
        return inputs[0] || null;
    }

    function findMessageTextbox() {
        // Discord's message textbox - try multiple selectors
        const selectors = [
            '[data-slate-editor="true"]',
            '[role="textbox"]',
            'div[class*="slateTextArea"]',
            'div[contenteditable="true"]'
        ];

        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el && el.getAttribute('contenteditable') === 'true') return el;
        }
        return null;
    }

    async function waitForCorrectChannel() {
        while (!isInCorrectChannel()) {
            // Check if upload was cancelled
            if (!STATE.uploadChannelId) {
                throw new Error('Upload cancelled by user');
            }

            if (!STATE.isPaused) {
                STATE.isPaused = true;
                console.warn('[Discord Batch Uploader] Wrong channel detected! Pausing uploads...');
                showPauseIndicator();
            }
            await sleep(500);
        }
        if (STATE.isPaused) {
            STATE.isPaused = false;
            console.log('[Discord Batch Uploader] Back in correct channel, resuming uploads...');
            hidePauseIndicator();
        }
    }

    async function uploadBatchToDiscord(batch, batchIndex) {
        console.log(`[Discord Batch Uploader] Uploading batch ${batchIndex+1}/${STATE.batches.length}...`);

        // Wait if user switched channels
        await waitForCorrectChannel();

        const fileInput = findFileInput();
        if (!fileInput) {
            console.error('[Discord Batch Uploader] Could not find file input');
            throw new Error('Could not find Discord file input');
        }

        // Create a new DataTransfer object to hold our files
        const dt = new DataTransfer();
        batch.forEach(file => dt.items.add(file));

        // Set files on the input
        fileInput.files = dt.files;

        // Trigger change event
        const changeEvent = new Event('change', { bubbles: true });
        fileInput.dispatchEvent(changeEvent);

        // Wait briefly for Discord to process the files
        await sleep(500);

        // Set the message text with batch info and send
        const textbox = findMessageTextbox();
        if (textbox) {
            const totalSize = batch.reduce((sum, f) => sum + f.size, 0);
            const sizeMB = bytesToMB(totalSize);

            // Use custom message format from settings
            const batchMessage = STATE.settings.batchMessageFormat
                .replace('{index}', batchIndex + 1)
                .replace('{total}', STATE.batches.length)
                .replace('{count}', batch.length)
                .replace('{size}', sizeMB);

            textbox.textContent = batchMessage;

            // Trigger input event so Discord knows text changed
            const inputEvent = new Event('input', { bubbles: true });
            textbox.dispatchEvent(inputEvent);

            // Wait a bit for text to register
            await sleep(100);

            // Simulate pressing Enter to send the message
            const enterEvent = new KeyboardEvent('keydown', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true
            });
            textbox.dispatchEvent(enterEvent);

            console.log(`[Discord Batch Uploader] Batch ${batchIndex+1} sent (Enter pressed)`);

            // Brief wait for message to send - Discord handles concurrent uploads well
            await sleep(300);
        } else {
            console.warn('[Discord Batch Uploader] Could not find textbox');
            throw new Error('Could not find message textbox');
        }

        console.log(`[Discord Batch Uploader] Batch ${batchIndex+1} uploaded successfully`);
    }

    function showPauseIndicator() {
        const existing = document.getElementById('dbu-pause-indicator');
        if (existing) return;

        const indicator = document.createElement('div');
        indicator.id = 'dbu-pause-indicator';
        indicator.style.cssText = `
            position: fixed; top: 20px; left: 50%; transform: translateX(-50%); z-index: 9999999;
            background: linear-gradient(135deg, #faa61a 0%, #f47b2c 100%);
            color: #fff; padding: 16px 24px; border-radius: 12px;
            box-shadow: 0 8px 24px rgba(250,166,26,0.5);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-weight: 600; font-size: 15px;
            animation: pulse 2s ease-in-out infinite;
        `;

        indicator.innerHTML = `
            <style>
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.7; }
                }
            </style>
            <div style="margin-bottom: 12px;">⏸️ Upload Paused - Return to original channel to resume</div>
            <button id="dbu-cancel-upload" style="padding: 8px 16px; background: rgba(237,66,69,0.9); color: #fff; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 13px; transition: all 0.2s;">
                Cancel Upload
            </button>
        `;

        document.body.appendChild(indicator);

        // Add cancel button handler
        indicator.querySelector('#dbu-cancel-upload').addEventListener('click', () => {
            STATE.uploadChannelId = null;
            STATE.isPaused = false;
            STATE.batches = [];
            hidePauseIndicator();
            const progressIndicator = document.getElementById('dbu-progress-indicator');
            if (progressIndicator) progressIndicator.remove();
            console.log('[Discord Batch Uploader] Upload cancelled by user');
        });
    }

    function hidePauseIndicator() {
        const existing = document.getElementById('dbu-pause-indicator');
        if (existing) existing.remove();
    }

    function showProgressIndicator(batchIndex, total) {
        const existing = document.getElementById('dbu-progress-indicator');
        if (existing) existing.remove();

        const indicator = document.createElement('div');
        indicator.id = 'dbu-progress-indicator';
        indicator.style.cssText = `
            position: fixed; bottom: 20px; right: 20px; z-index: 9999998;
            background: linear-gradient(135deg, #5865F2 0%, #4752c4 100%);
            color: #fff; padding: 16px 20px; border-radius: 12px;
            box-shadow: 0 8px 24px rgba(88,101,242,0.4);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-weight: 600; min-width: 200px;
        `;

        const percentage = Math.round((batchIndex / total) * 100);

        indicator.innerHTML = `
            <div style="margin-bottom: 8px">📦 Uploading Batches...</div>
            <div style="background: rgba(0,0,0,0.3); border-radius: 8px; height: 8px; overflow: hidden; margin-bottom: 8px">
                <div style="background: #3ba55d; height: 100%; width: ${percentage}%; transition: width 0.3s ease"></div>
            </div>
            <div style="font-size: 13px; opacity: 0.9">Batch ${batchIndex}/${total} (${percentage}%)</div>
        `;

        document.body.appendChild(indicator);
        return indicator;
    }

    async function startBatchUpload() {
        console.log('[Discord Batch Uploader] Starting automatic batch upload with', STATE.batches.length, 'batches');

        // Store the channel ID where upload started
        STATE.uploadChannelId = getCurrentChannelId();
        console.log('[Discord Batch Uploader] Upload locked to channel:', STATE.uploadChannelId);

        try {
            for (let i = 0; i < STATE.batches.length; i++) {
                // Show progress indicator
                showProgressIndicator(i + 1, STATE.batches.length);

                // Upload this batch
                await uploadBatchToDiscord(STATE.batches[i], i);

                // Delay between batches based on settings
                if (i < STATE.batches.length - 1) {
                    const delay = STATE.settings.delayBetweenBatches;
                    console.log(`[Discord Batch Uploader] Waiting ${delay}ms before next batch...`);
                    await sleep(delay);
                }
            }

            // Remove progress indicator
            const indicator = document.getElementById('dbu-progress-indicator');
            if (indicator) indicator.remove();

            // Clear channel lock
            STATE.uploadChannelId = null;
            STATE.isPaused = false;
            hidePauseIndicator();

            // Show completion message (only if enabled in settings)
            if (STATE.settings.showNotifications) {
                const completion = document.createElement('div');
                completion.style.cssText = `
                    position: fixed; top: 20px; right: 20px; z-index: 9999998;
                    background: linear-gradient(135deg, #3ba55d 0%, #2d7d46 100%);
                    color: #fff; padding: 16px 20px; border-radius: 12px;
                    box-shadow: 0 8px 24px rgba(59,165,93,0.4);
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                    font-weight: 600;
                `;
                completion.textContent = `🎉 All ${STATE.batches.length} batches uploaded successfully!`;
                document.body.appendChild(completion);

                setTimeout(() => completion.remove(), 5000);
            }

            console.log('[Discord Batch Uploader] All batches completed!');
        } catch (error) {
            console.error('[Discord Batch Uploader] Error during batch upload:', error);

            // Clear channel lock
            STATE.uploadChannelId = null;
            STATE.isPaused = false;
            hidePauseIndicator();

            // Show error message
            const errorMsg = document.createElement('div');
            errorMsg.style.cssText = `
                position: fixed; top: 20px; right: 20px; z-index: 9999998;
                background: linear-gradient(135deg, #ed4245 0%, #c23537 100%);
                color: #fff; padding: 16px 20px; border-radius: 12px;
                box-shadow: 0 8px 24px rgba(237,66,69,0.4);
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                font-weight: 600;
            `;
            errorMsg.textContent = `❌ Upload failed: ${error.message}`;
            document.body.appendChild(errorMsg);

            setTimeout(() => errorMsg.remove(), 8000);
        }
    }

    // ==================== SETTINGS UI ====================
    function createSettingsButton() {
        const button = document.createElement('div');
        button.id = 'dbu-settings-button';
        button.style.cssText = `
            position: fixed; bottom: 20px; right: 20px; z-index: 9999997;
            background: linear-gradient(135deg, #5865F2 0%, #4752c4 100%);
            color: #fff; padding: 10px 14px; border-radius: 8px;
            box-shadow: 0 4px 12px rgba(88,101,242,0.3);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-weight: 600; font-size: 13px; cursor: pointer;
            transition: all 0.2s ease; user-select: none;
            display: flex; align-items: center; gap: 8px;
        `;

        button.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 15.5A3.5 3.5 0 0 1 8.5 12 3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5 3.5 3.5 0 0 1-3.5 3.5m7.43-2.53c.04-.32.07-.64.07-.97 0-.33-.03-.66-.07-1l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.31-.61-.22l-2.49 1c-.52-.39-1.06-.73-1.69-.98l-.37-2.65A.506.506 0 0 0 14 2h-4c-.25 0-.46.18-.5.42l-.37 2.65c-.63.25-1.17.59-1.69.98l-2.49-1c-.22-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64L4.57 11c-.04.34-.07.67-.07 1 0 .33.03.65.07.97l-2.11 1.66c-.19.15-.25.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1.01c.52.4 1.06.74 1.69.99l.37 2.65c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.37-2.65c.63-.26 1.17-.59 1.69-.99l2.49 1.01c.22.08.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.66z"/>
            </svg>
            Batch Uploader
        `;

        button.addEventListener('mouseenter', () => {
            button.style.transform = 'translateY(-2px)';
            button.style.boxShadow = '0 6px 16px rgba(88,101,242,0.4)';
        });

        button.addEventListener('mouseleave', () => {
            button.style.transform = 'translateY(0)';
            button.style.boxShadow = '0 4px 12px rgba(88,101,242,0.3)';
        });

        button.addEventListener('click', showSettingsModal);

        document.body.appendChild(button);
    }

    function showSettingsModal() {
        // Remove existing modal if any
        const existing = document.getElementById('dbu-settings-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'dbu-settings-modal';
        modal.style.cssText = `
            position: fixed; inset: 0; z-index: 9999999;
            background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        `;

        modal.innerHTML = `
            <div style="background: linear-gradient(135deg, #2c2f33 0%, #23272a 100%); color: #fff; padding: 24px; border-radius: 16px; max-width: 500px; width: 90%; box-shadow: 0 8px 32px rgba(0,0,0,0.5)">
                <h2 style="margin: 0 0 20px 0; color: #5865F2; display: flex; align-items: center; gap: 10px">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 15.5A3.5 3.5 0 0 1 8.5 12 3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5 3.5 3.5 0 0 1-3.5 3.5m7.43-2.53c.04-.32.07-.64.07-.97 0-.33-.03-.66-.07-1l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.31-.61-.22l-2.49 1c-.52-.39-1.06-.73-1.69-.98l-.37-2.65A.506.506 0 0 0 14 2h-4c-.25 0-.46.18-.5.42l-.37 2.65c-.63.25-1.17.59-1.69.98l-2.49-1c-.22-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64L4.57 11c-.04.34-.07.67-.07 1 0 .33.03.65.07.97l-2.11 1.66c-.19.15-.25.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1.01c.52.4 1.06.74 1.69.99l.37 2.65c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.37-2.65c.63-.26 1.17-.59 1.69-.99l2.49 1.01c.22.08.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.66z"/>
                    </svg>
                    Batch Uploader Settings
                </h2>

                <div style="display: flex; flex-direction: column; gap: 20px;">
                    <!-- Enable Script -->
                    <label style="display: flex; align-items: center; justify-content: space-between; padding: 12px; background: rgba(0,0,0,0.2); border-radius: 8px; cursor: pointer;">
                        <span style="font-weight: 500;">Enable Batch Uploader</span>
                        <input type="checkbox" id="dbu-setting-enable" ${STATE.settings.enableScript ? 'checked' : ''} style="width: 20px; height: 20px; cursor: pointer; accent-color: #5865F2" />
                    </label>

                    <!-- Default Tier -->
                    <div style="padding: 12px; background: rgba(0,0,0,0.2); border-radius: 8px;">
                        <label style="display: block; margin-bottom: 8px; font-size: 13px; font-weight: 600;">
                            Your Discord Tier:
                        </label>
                        <select id="dbu-setting-tier" style="width: 100%; padding: 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,.2); background: rgba(0,0,0,.3); color: #fff; font-size: 14px; cursor: pointer; font-weight: 500">
                            <option value="2" ${STATE.settings.defaultTier === '2' ? 'selected' : ''}>Nitro (500 MB per file)</option>
                            <option value="3" ${STATE.settings.defaultTier === '3' ? 'selected' : ''}>Nitro Basic (50 MB per file)</option>
                            <option value="1" ${STATE.settings.defaultTier === '1' ? 'selected' : ''}>Nitro Classic (50 MB per file)</option>
                            <option value="0" ${STATE.settings.defaultTier === '0' ? 'selected' : ''}>Free (25 MB per file)</option>
                        </select>
                    </div>

                    <!-- Delay Between Batches -->
                    <div style="padding: 12px; background: rgba(0,0,0,0.2); border-radius: 8px;">
                        <label style="display: block; margin-bottom: 8px; font-size: 13px; font-weight: 600;">
                            Delay Between Batches: <span id="dbu-delay-value">${STATE.settings.delayBetweenBatches}ms</span>
                        </label>
                        <input type="range" id="dbu-setting-delay" min="100" max="2000" step="100" value="${STATE.settings.delayBetweenBatches}" style="width: 100%; cursor: pointer; accent-color: #5865F2" />
                        <div style="display: flex; justify-content: space-between; font-size: 11px; opacity: 0.6; margin-top: 4px;">
                            <span>Fast (100ms)</span>
                            <span>Slow (2000ms)</span>
                        </div>
                    </div>

                    <!-- Show Notifications -->
                    <label style="display: flex; align-items: center; justify-content: space-between; padding: 12px; background: rgba(0,0,0,0.2); border-radius: 8px; cursor: pointer;">
                        <span style="font-weight: 500;">Show Completion Notifications</span>
                        <input type="checkbox" id="dbu-setting-notifications" ${STATE.settings.showNotifications ? 'checked' : ''} style="width: 20px; height: 20px; cursor: pointer; accent-color: #5865F2" />
                    </label>

                    <!-- Batch Message Format -->
                    <div style="padding: 12px; background: rgba(0,0,0,0.2); border-radius: 8px;">
                        <label style="display: block; margin-bottom: 8px; font-size: 13px; font-weight: 600;">
                            Batch Message Format:
                        </label>
                        <input type="text" id="dbu-setting-format" value="${STATE.settings.batchMessageFormat}" style="width: 100%; padding: 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,.2); background: rgba(0,0,0,.3); color: #fff; font-size: 13px; font-family: monospace;" />
                        <div style="font-size: 11px; opacity: 0.6; margin-top: 6px; line-height: 1.4;">
                            Variables: {index}, {total}, {count}, {size}
                        </div>
                    </div>
                </div>

                <div style="display: flex; gap: 10px; margin-top: 24px;">
                    <button id="dbu-settings-save" style="flex: 1; padding: 14px; background: #5865F2; color: #fff; border: none; border-radius: 10px; font-weight: 600; font-size: 15px; cursor: pointer; transition: all .2s">
                        Save Settings
                    </button>
                    <button id="dbu-settings-cancel" style="padding: 14px 20px; background: rgba(237,66,69,.15); color: #ed4245; border: 1px solid rgba(237,66,69,.3); border-radius: 10px; font-weight: 600; cursor: pointer;">
                        Cancel
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Delay slider value update
        const delaySlider = modal.querySelector('#dbu-setting-delay');
        const delayValue = modal.querySelector('#dbu-delay-value');
        delaySlider.addEventListener('input', (e) => {
            delayValue.textContent = e.target.value + 'ms';
        });

        // Save button
        modal.querySelector('#dbu-settings-save').addEventListener('click', () => {
            STATE.settings.enableScript = modal.querySelector('#dbu-setting-enable').checked;
            STATE.settings.defaultTier = modal.querySelector('#dbu-setting-tier').value;
            STATE.settings.delayBetweenBatches = parseInt(modal.querySelector('#dbu-setting-delay').value);
            STATE.settings.showNotifications = modal.querySelector('#dbu-setting-notifications').checked;
            STATE.settings.batchMessageFormat = modal.querySelector('#dbu-setting-format').value;

            // Update limits based on new tier selection
            STATE.limits = limitsForPremiumType(STATE.settings.defaultTier);

            saveSettings();
            modal.remove();

            // Show saved notification
            const notification = document.createElement('div');
            notification.style.cssText = `
                position: fixed; top: 20px; right: 20px; z-index: 9999998;
                background: linear-gradient(135deg, #3ba55d 0%, #2d7d46 100%);
                color: #fff; padding: 16px 20px; border-radius: 12px;
                box-shadow: 0 8px 24px rgba(59,165,93,0.4);
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                font-weight: 600;
            `;
            notification.textContent = '✓ Settings saved successfully!';
            document.body.appendChild(notification);
            setTimeout(() => notification.remove(), 3000);
        });

        // Cancel button
        modal.querySelector('#dbu-settings-cancel').addEventListener('click', () => {
            modal.remove();
        });

        // Click outside to close
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    // ==================== FILE INTERCEPTOR ====================
    function setupFileInterceptor() {
        console.log('[Discord Batch Uploader] Setting up file interceptor...');

        // Intercept at document level with capture phase
        document.addEventListener('drop', async (e) => {
            // Check if script is enabled
            if (!STATE.settings.enableScript) {
                console.log('[Discord Batch Uploader] Script is disabled in settings');
                return;
            }

            const files = Array.from(e.dataTransfer?.files || []);
            if (!files.length) return;

            console.log('[Discord Batch Uploader] Intercepted drop with', files.length, 'files');

            const limits = STATE.limits || DEFAULT_LIMITS;
            const perFileBytes = mbToBytes(limits.perFileMB);
            const perMsgBytes = mbToBytes(limits.perMessageTotalMB);

            const totalSize = files.reduce((sum, f) => sum + f.size, 0);
            const hasOversizedFiles = files.some(f => f.size > perFileBytes);
            const exceedsMessageLimit = totalSize > perMsgBytes || files.length > 10;

            if (hasOversizedFiles || exceedsMessageLimit) {
                console.log('[Discord Batch Uploader] Files exceed limits, intercepting...');
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();

                prepareBatches(files);
                showBatchModal(files);
            } else {
                console.log('[Discord Batch Uploader] Files within limits, allowing Discord to handle');
            }
        }, true);

        // Also intercept paste
        document.addEventListener('paste', async (e) => {
            const items = Array.from(e.clipboardData?.items || []);
            const fileItems = items.filter(item => item.kind === 'file');
            if (!fileItems.length) return;

            const files = fileItems.map(item => item.getAsFile()).filter(Boolean);
            console.log('[Discord Batch Uploader] Intercepted paste with', files.length, 'files');

            const limits = STATE.limits || DEFAULT_LIMITS;
            const perFileBytes = mbToBytes(limits.perFileMB);
            const perMsgBytes = mbToBytes(limits.perMessageTotalMB);

            const totalSize = files.reduce((sum, f) => sum + f.size, 0);
            const hasOversizedFiles = files.some(f => f.size > perFileBytes);
            const exceedsMessageLimit = totalSize > perMsgBytes || files.length > 10;

            if (hasOversizedFiles || exceedsMessageLimit) {
                console.log('[Discord Batch Uploader] Pasted files exceed limits, intercepting...');
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();

                prepareBatches(files);
                showBatchModal(files);
            }
        }, true);

        console.log('[Discord Batch Uploader] File interceptor active');
    }

    // ==================== INITIALIZATION ====================
    function initialize() {
        console.log('[Discord Batch Uploader] Initializing...');

        // Load saved settings
        loadSettings();

        // Initialize limits from settings
        STATE.limits = limitsForPremiumType(STATE.settings.defaultTier);
        console.log('[Discord Batch Uploader] Using tier:', STATE.limits.tier);

        // Setup file interceptor
        setupFileInterceptor();

        // Create settings button
        createSettingsButton();

        console.log('[Discord Batch Uploader] Ready! Drag files to Discord to auto-batch uploads.');
    }

    // Wait for Discord to load, then initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(initialize, 2000);
        });
    } else {
        setTimeout(initialize, 2000);
    }

})();
