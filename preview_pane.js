// --- START OF FILE preview_pane.js ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("preview_pane.js: DOMContentLoaded event fired.");
    const previewPaneContainer = document.getElementById('previewPane');
    const previewPaneContentArea = document.getElementById('previewPaneContentArea');

    const previewUrlInputHeader = document.getElementById('previewUrlInputHeader');
    const refreshButtonHeader = document.getElementById('previewBtnRefresh');
    const backButtonHeader = document.getElementById('previewBtnBack');
    const forwardButtonHeader = document.getElementById('previewBtnForward');
    const openInNewTabButtonHeader = document.getElementById('previewBtnOpenNewTab');


    if (!previewPaneContainer) {
        console.warn("preview_pane.js: Preview pane container (#previewPane) not found. Script will not initialize fully.");
        return;
    }
    console.log("preview_pane.js: previewPaneContainer (#previewPane) found.");
    if (!previewPaneContentArea) {
        console.warn("preview_pane.js: Preview pane content area (#previewPaneContentArea) not found. HTML injection might fail.");
    } else {
        console.log("preview_pane.js: previewPaneContentArea (#previewPaneContentArea) found.");
    }
    if (!previewUrlInputHeader) console.warn("preview_pane.js: previewUrlInputHeader not found.");
    // ... (log other header elements if needed)


    const previewPaneHTMLContent = `
        <div class="preview-placeholder" id="previewInternalPlaceholder" style="display: flex;">
            <p>No preview available or URL not loaded.</p>
        </div>
        <iframe id="previewInternalIframe" style="display: none;"></iframe>
    `;
    console.log("preview_pane.js: previewPaneHTMLContent defined.");

    let previewInternalIframe, previewInternalPlaceholder;

    function allPreviewPaneElementsFound() {
        const found = previewInternalIframe && previewInternalPlaceholder;
        // console.log("preview_pane.js: allPreviewPaneElementsFound check:", {
        //     previewInternalIframe: !!previewInternalIframe,
        //     previewInternalPlaceholder: !!previewInternalPlaceholder,
        //     allFound: found
        // });
        return found;
    }

    function setupInternalPreviewElements() {
        console.log("preview_pane.js: setupInternalPreviewElements called.");
        if (!previewPaneContentArea) {
            console.error("preview_pane.js: setupInternalPreviewElements - previewPaneContentArea is null! Cannot query children.");
            return;
        }
        previewInternalIframe = previewPaneContentArea.querySelector('#previewInternalIframe');
        previewInternalPlaceholder = previewPaneContentArea.querySelector('#previewInternalPlaceholder');

        if (!previewInternalIframe) console.error("preview_pane.js: setupInternalPreviewElements - previewInternalIframe not found!");
        else console.log("preview_pane.js: setupInternalPreviewElements - previewInternalIframe found.");
        if (!previewInternalPlaceholder) console.error("preview_pane.js: setupInternalPreviewElements - previewInternalPlaceholder not found!");
        else console.log("preview_pane.js: setupInternalPreviewElements - previewInternalPlaceholder found.");
        console.log("preview_pane.js: setupInternalPreviewElements finished.");
    }

    function attachHeaderEventListeners() {
        console.log("preview_pane.js: attachHeaderEventListeners called.");
        if (previewUrlInputHeader) {
            previewUrlInputHeader.addEventListener('keypress', handleUrlInputKeypress);
            console.log("preview_pane.js: Attached keypress listener to previewUrlInputHeader.");
        } else console.warn("preview_pane.js: previewUrlInputHeader not found, cannot attach keypress listener.");

        if (refreshButtonHeader) {
            refreshButtonHeader.addEventListener('click', handleRefreshClick);
            console.log("preview_pane.js: Attached click listener to refreshButtonHeader.");
        } else console.warn("preview_pane.js: refreshButtonHeader not found, cannot attach click listener.");

        if (backButtonHeader) {
            backButtonHeader.addEventListener('click', handleBackClick);
            console.log("preview_pane.js: Attached click listener to backButtonHeader.");
        } else console.warn("preview_pane.js: backButtonHeader not found, cannot attach click listener.");

        if (forwardButtonHeader) {
            forwardButtonHeader.addEventListener('click', handleForwardClick);
            console.log("preview_pane.js: Attached click listener to forwardButtonHeader.");
        } else console.warn("preview_pane.js: forwardButtonHeader not found, cannot attach click listener.");

        if (openInNewTabButtonHeader) {
            openInNewTabButtonHeader.addEventListener('click', handleOpenInNewTabClick);
            console.log("preview_pane.js: Attached click listener to openInNewTabButtonHeader.");
        } else console.warn("preview_pane.js: openInNewTabButtonHeader not found, cannot attach click listener.");
        console.log("preview_pane.js: attachHeaderEventListeners finished.");
    }
    attachHeaderEventListeners(); // Call it once on script load for header elements that are always present.

    function handleUrlInputKeypress(e) {
        console.log(`preview_pane.js: handleUrlInputKeypress - Key: ${e.key}`);
        if (e.key === 'Enter') {
            console.log("preview_pane.js: handleUrlInputKeypress - Enter key pressed.");
            if (previewPaneContainer.classList.contains('active-pane')) {
                console.log("preview_pane.js: handleUrlInputKeypress - Pane is active, calling loadPreview.");
                loadPreview();
            } else {
                console.log("preview_pane.js: handleUrlInputKeypress - Pane is not active, loadPreview not called.");
            }
        }
    }
    function handleRefreshClick() {
        console.log("preview_pane.js: handleRefreshClick called.");
        if (previewPaneContainer.classList.contains('active-pane')) {
            console.log("preview_pane.js: handleRefreshClick - Pane is active.");
            if (previewInternalIframe && previewInternalIframe.style.display === 'block' && previewInternalIframe.src && previewInternalIframe.src !== 'about:blank') {
                console.log("preview_pane.js: handleRefreshClick - Refreshing iframe contentWindow.");
                try { previewInternalIframe.contentWindow.location.reload(); }
                catch (e) {
                    console.warn("preview_pane.js: handleRefreshClick - Error reloading iframe directly, trying src reset. Error:", e);
                    const currentSrc = previewInternalIframe.src;
                    previewInternalIframe.src = 'about:blank';
                    setTimeout(() => { previewInternalIframe.src = currentSrc; }, 50);
                }
            } else {
                console.log("preview_pane.js: handleRefreshClick - Iframe not ready or no src, calling loadPreview to load from input.");
                loadPreview();
            }
        } else {
            console.log("preview_pane.js: handleRefreshClick - Pane is not active.");
        }
    }
    function handleBackClick() {
        console.log("preview_pane.js: handleBackClick called.");
        if (previewPaneContainer.classList.contains('active-pane') && previewInternalIframe && previewInternalIframe.style.display === 'block') {
             console.log("preview_pane.js: handleBackClick - Attempting iframe history back.");
             try { previewInternalIframe.contentWindow.history.back(); } catch (e) { console.warn("preview_pane.js: Preview back error:", e); }
        } else {
            console.log("preview_pane.js: handleBackClick - Pane not active or iframe not ready.");
        }
    }
    function handleForwardClick() {
        console.log("preview_pane.js: handleForwardClick called.");
        if (previewPaneContainer.classList.contains('active-pane') && previewInternalIframe && previewInternalIframe.style.display === 'block') {
             console.log("preview_pane.js: handleForwardClick - Attempting iframe history forward.");
             try { previewInternalIframe.contentWindow.history.forward(); } catch (e) { console.warn("preview_pane.js: Preview forward error:", e); }
        } else {
            console.log("preview_pane.js: handleForwardClick - Pane not active or iframe not ready.");
        }
    }
    function handleOpenInNewTabClick() {
        console.log("preview_pane.js: handleOpenInNewTabClick called.");
        let urlToOpen = previewUrlInputHeader ? previewUrlInputHeader.value.trim() : '';
        console.log("preview_pane.js: handleOpenInNewTabClick - URL from input:", urlToOpen);
        if (urlToOpen && (urlToOpen.startsWith('http') || urlToOpen.startsWith('/')) && urlToOpen !== 'about:blank' && urlToOpen !== '/') {
            console.log("preview_pane.js: handleOpenInNewTabClick - Opening URL from input in new tab:", urlToOpen);
            window.open(urlToOpen, '_blank');
        } else if (previewInternalIframe && previewInternalIframe.style.display === 'block' && previewInternalIframe.src && previewInternalIframe.src !== 'about:blank') {
            console.log("preview_pane.js: handleOpenInNewTabClick - Opening iframe src in new tab:", previewInternalIframe.src);
            window.open(previewInternalIframe.src, '_blank');
        } else {
            console.log("preview_pane.js: handleOpenInNewTabClick - No valid URL to open.");
            if (typeof window.showToast === 'function') window.showToast('No valid URL to open.', 'info');
        }
    }


    window.BoltDevUI = window.BoltDevUI || {};
    console.log("preview_pane.js: BoltDevUI object ensured.");

    function loadPreview() {
        console.log("preview_pane.js: loadPreview called.");
        if (!allPreviewPaneElementsFound()) {
             console.warn("preview_pane.js: loadPreview - Preview pane internal elements not ready. Attempting setup again.");
             if (previewPaneContentArea && previewPaneContentArea.innerHTML.trim() !== '') { // Check if content area has been populated
                setupInternalPreviewElements();
                if (!allPreviewPaneElementsFound()) {
                    console.error("preview_pane.js: loadPreview - Still not all elements found after re-setup. Load will likely fail.");
                    return;
                }
             } else {
                 console.error("preview_pane.js: loadPreview - Content area is empty (or not yet populated by activatePane), cannot re-setup. Load will fail.");
                 return;
             }
        }

        let url = previewUrlInputHeader ? previewUrlInputHeader.value.trim() : '/'; // Default to '/' if input is missing or empty
        console.log("preview_pane.js: loadPreview - Initial URL from input:", url);
        let isValidUrl = url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/') || url === 'about:blank';

        if (url && url.includes(':') && !url.startsWith('http') && !url.startsWith('about:')) {
            const parts = url.split(':');
            if (parts.length === 2 && !isNaN(parseInt(parts[1].charAt(0)))) { // e.g. localhost:3000
                 url = 'http://' + url;
                 if(previewUrlInputHeader) previewUrlInputHeader.value = url;
                 isValidUrl = true;
                 console.log("preview_pane.js: loadPreview - Prepended http:// to URL. New URL:", url);
            }
        }
        console.log("preview_pane.js: loadPreview - Final URL to load:", url, "isValidUrl:", isValidUrl);

        if (url && isValidUrl && url !== 'about:blank' && url !== '/') {
            console.log("preview_pane.js: loadPreview - Setting iframe src to:", url);
            previewInternalIframe.src = url;
            previewInternalIframe.style.display = 'block';
            previewInternalPlaceholder.style.display = 'none';
        } else {
            console.log("preview_pane.js: loadPreview - URL is invalid, blank, or root. Showing placeholder.");
            previewInternalIframe.src = 'about:blank';
            previewInternalIframe.style.display = 'none';
            previewInternalPlaceholder.style.display = 'flex';
        }
        console.log("preview_pane.js: loadPreview finished.");
    }

    // --- MODIFIED activatePreviewPane ---
    window.BoltDevUI.activatePreviewPane = function() {
        console.log("preview_pane.js: activatePreviewPane called.");
        if (!previewPaneContainer || !previewPaneContentArea) {
            console.error("preview_pane.js: activatePreviewPane - previewPaneContainer or previewPaneContentArea is null! Cannot activate.");
            return;
        }

        // Always re-inject HTML into the content area for consistency
        console.log("preview_pane.js: activatePreviewPane - Preview pane content area is being (re)injected.");
        previewPaneContentArea.innerHTML = previewPaneHTMLContent;
        console.log("preview_pane.js: activatePreviewPane - HTML (re)injected into previewPaneContentArea.");

        setTimeout(() => {
            console.log("preview_pane.js: activatePreviewPane - setTimeout callback executing for setup.");
            setupInternalPreviewElements(); // Query based on newly injected HTML

            if (!allPreviewPaneElementsFound()) {
                console.error("preview_pane.js: activatePreviewPane (setTimeout) - Not all internal elements found after setup. Load might fail.");
            } else {
                console.log("preview_pane.js: activatePreviewPane (setTimeout) - All internal elements found.");
            }
            loadPreview(); // Load initial preview based on current input value or default
            console.log("preview_pane.js: activatePreviewPane (setTimeout) finished, initial loadPreview called.");
        }, 0);
        console.log("preview_pane.js: activatePreviewPane function finished (setTimeout scheduled).");
    };
    // --- END OF MODIFIED activatePreviewPane ---

    window.BoltDevUI.deactivatePreviewPane = function() {
        console.log("preview_pane.js: deactivatePreviewPane called.");
        if (previewInternalIframe) {
            console.log("preview_pane.js: deactivatePreviewPane - Setting iframe src to about:blank to stop potential activity.");
            previewInternalIframe.src = 'about:blank';
        } else {
            // If iframe wasn't even set up (e.g. pane never fully activated), this is fine.
            console.log("preview_pane.js: deactivatePreviewPane - previewInternalIframe not found or not set up.");
        }
    };

    if (previewPaneContainer && previewPaneContainer.classList.contains('active-pane')) {
        console.log("preview_pane.js: Preview pane is active on DOMContentLoaded, calling activatePreviewPane.");
        window.BoltDevUI.activatePreviewPane();
    } else {
        console.log("preview_pane.js: Preview pane is NOT active on DOMContentLoaded.");
    }
    console.log("preview_pane.js: Script execution finished.");
});
// --- END OF FILE preview_pane.js ---