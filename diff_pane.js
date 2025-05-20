// --- START OF FILE diff_pane.js ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("diff_pane.js: DOMContentLoaded event fired.");
    const diffPaneContainer = document.getElementById('diffPane');
    const diffPaneContentArea = document.getElementById('diffPaneContentArea');

    const diffFilePathHeaderSpan = document.getElementById('diffFilePathHeader');
    const diffStatusTextHeaderSpan = document.getElementById('diffStatusTextHeader');

    if (!diffPaneContainer) {
        console.warn("diff_pane.js: Diff pane container (#diffPane) not found. Script will not initialize fully.");
        return;
    }
    console.log("diff_pane.js: diffPaneContainer (#diffPane) found.");
    if (!diffPaneContentArea) {
        console.warn("diff_pane.js: Diff pane content area (#diffPaneContentArea) not found. HTML injection might fail.");
    } else {
        console.log("diff_pane.js: diffPaneContentArea (#diffPaneContentArea) found.");
    }
    if (!diffFilePathHeaderSpan) console.warn("diff_pane.js: diffFilePathHeaderSpan not found.");
    if (!diffStatusTextHeaderSpan) console.warn("diff_pane.js: diffStatusTextHeaderSpan not found.");


    const diffPaneHTMLContent = `
        <div class="diff-placeholder" id="diffInternalPlaceholder">
            <span class="diff-icon">📄</span>
            <h3>Files are identical</h3>
            <p>Both versions match exactly</p>
        </div>
        <div id="diffInternalOutput" style="display:none;">
            <!-- Actual line-by-line diffs will be injected here -->
        </div>
        <div class="diff-current-content-label">Current Content</div>
        <div class="diff-current-content-viewer">
            <pre id="diffInternalCurrentContentPre" class="line-numbers"><code id="diffInternalCurrentContentCode" class="language-plaintext">// Select a file to see its current content here.</code></pre>
        </div>
    `;
    console.log("diff_pane.js: diffPaneHTMLContent defined.");

    let diffInternalPlaceholder, diffInternalOutput, diffInternalCurrentContentPre, diffInternalCurrentContentCode;

    function allDiffPaneElementsFound() {
        const found = diffInternalPlaceholder && diffInternalOutput && diffInternalCurrentContentPre && diffInternalCurrentContentCode;
        // console.log("diff_pane.js: allDiffPaneElementsFound check:", {
        //     diffInternalPlaceholder: !!diffInternalPlaceholder,
        //     diffInternalOutput: !!diffInternalOutput,
        //     diffInternalCurrentContentPre: !!diffInternalCurrentContentPre,
        //     diffInternalCurrentContentCode: !!diffInternalCurrentContentCode,
        //     allFound: found
        // });
        return found;
    }

    function setupInternalDiffElements() {
        console.log("diff_pane.js: setupInternalDiffElements called.");
        if (!diffPaneContentArea) {
            console.error("diff_pane.js: setupInternalDiffElements - diffPaneContentArea is null! Cannot query children.");
            return;
        }
        diffInternalPlaceholder = diffPaneContentArea.querySelector('#diffInternalPlaceholder');
        diffInternalOutput = diffPaneContentArea.querySelector('#diffInternalOutput');
        diffInternalCurrentContentPre = diffPaneContentArea.querySelector('#diffInternalCurrentContentPre');
        diffInternalCurrentContentCode = diffPaneContentArea.querySelector('#diffInternalCurrentContentCode');

        if (!diffInternalPlaceholder) console.error("diff_pane.js: setupInternalDiffElements - diffInternalPlaceholder not found!");
        else console.log("diff_pane.js: setupInternalDiffElements - diffInternalPlaceholder found.");
        if (!diffInternalOutput) console.error("diff_pane.js: setupInternalDiffElements - diffInternalOutput not found!");
        else console.log("diff_pane.js: setupInternalDiffElements - diffInternalOutput found.");
        if (!diffInternalCurrentContentPre) console.error("diff_pane.js: setupInternalDiffElements - diffInternalCurrentContentPre not found!");
        else console.log("diff_pane.js: setupInternalDiffElements - diffInternalCurrentContentPre found.");
        if (!diffInternalCurrentContentCode) console.error("diff_pane.js: setupInternalDiffElements - diffInternalCurrentContentCode not found!");
        else console.log("diff_pane.js: setupInternalDiffElements - diffInternalCurrentContentCode found.");
        console.log("diff_pane.js: setupInternalDiffElements finished.");
    }

    window.BoltDevUI = window.BoltDevUI || {};
    console.log("diff_pane.js: BoltDevUI object ensured.");

    window.BoltDevUI.updateDiffPaneView = function(filePath, fileContent, languageClass, diffStatus = "No Changes", hasChanges = false, diffHtml = null) {
        console.log(`diff_pane.js: updateDiffPaneView called with:`, { filePath, languageClass, diffStatus, hasChanges, fileContent: fileContent ? fileContent.substring(0,50)+'...' : null, diffHtml: diffHtml ? diffHtml.substring(0,50)+'...' : null });
        if (!allDiffPaneElementsFound()) {
             console.warn("diff_pane.js: updateDiffPaneView - Diff pane internal elements not ready. Attempting setup again.");
             if (diffPaneContentArea && diffPaneContentArea.innerHTML.trim() !== '') { // Check if content area has been populated
                setupInternalDiffElements();
                if (!allDiffPaneElementsFound()) {
                    console.error("diff_pane.js: updateDiffPaneView - Still not all elements found after re-setup. Update will likely fail.");
                    return;
                }
             } else {
                console.error("diff_pane.js: updateDiffPaneView - Content area is empty (or not yet populated by activatePane), cannot re-setup. Update will fail.");
                return;
             }
        }

        if (diffFilePathHeaderSpan) {
            diffFilePathHeaderSpan.textContent = filePath || "No file selected";
            diffFilePathHeaderSpan.title = filePath || "No file selected";
            console.log("diff_pane.js: updateDiffPaneView - Updated diffFilePathHeaderSpan.");
        } else {
            console.warn("diff_pane.js: updateDiffPaneView - diffFilePathHeaderSpan not found, cannot update file path in header.");
        }

        if (diffStatusTextHeaderSpan) {
            diffStatusTextHeaderSpan.textContent = diffStatus;
            diffStatusTextHeaderSpan.className = 'diff-status'; // Reset classes
            if (hasChanges) {
                diffStatusTextHeaderSpan.classList.add('has-changes');
            } else {
                diffStatusTextHeaderSpan.classList.add('no-changes');
            }
            console.log("diff_pane.js: updateDiffPaneView - Updated diffStatusTextHeaderSpan. Class: " + diffStatusTextHeaderSpan.className);
        } else {
            console.warn("diff_pane.js: updateDiffPaneView - diffStatusTextHeaderSpan not found, cannot update status text in header.");
        }

        if (fileContent !== null) {
            diffInternalCurrentContentCode.textContent = fileContent;
            diffInternalCurrentContentPre.className = `line-numbers language-${languageClass || 'plaintext'}`;
            console.log(`diff_pane.js: updateDiffPaneView - Set current content. Language class: ${diffInternalCurrentContentPre.className}`);
            if (typeof Prism !== 'undefined' && diffInternalCurrentContentCode.offsetParent !== null) {
                console.log("diff_pane.js: updateDiffPaneView - Highlighting current content with Prism.");
                Prism.highlightElement(diffInternalCurrentContentCode);
            } else {
                console.log("diff_pane.js: updateDiffPaneView - Prism not available or element not visible for current content.");
            }
            diffInternalCurrentContentPre.scrollTop = 0;
        } else {
            console.log("diff_pane.js: updateDiffPaneView - fileContent is null, setting placeholder for current content.");
            diffInternalCurrentContentCode.textContent = '// No content to display or file not selected.';
            diffInternalCurrentContentPre.className = 'line-numbers language-plaintext';
             if (typeof Prism !== 'undefined' && diffInternalCurrentContentCode.offsetParent !== null) {
                console.log("diff_pane.js: updateDiffPaneView - Highlighting placeholder current content with Prism.");
                Prism.highlightElement(diffInternalCurrentContentCode);
            }
        }

        if (hasChanges && diffHtml && diffInternalOutput) {
            console.log("diff_pane.js: updateDiffPaneView - Has changes and diffHtml provided. Displaying diff output.");
            if (diffInternalPlaceholder) diffInternalPlaceholder.style.display = 'none';
            diffInternalOutput.innerHTML = diffHtml;
            diffInternalOutput.style.display = 'flex';
        } else {
            console.log("diff_pane.js: updateDiffPaneView - No changes or no diffHtml. Displaying placeholder.");
            if (diffInternalPlaceholder) diffInternalPlaceholder.style.display = 'flex';
            if (diffInternalOutput) diffInternalOutput.style.display = 'none';
        }
        console.log("diff_pane.js: updateDiffPaneView finished.");
    };

    // --- MODIFIED activateDiffPane ---
    window.BoltDevUI.activateDiffPane = function(currentOpenFile, currentOpenContent, currentOpenLangClass) {
        console.log("diff_pane.js: activateDiffPane called with:", { currentOpenFile, currentOpenLangClass, currentOpenContent: currentOpenContent ? currentOpenContent.substring(0,50)+'...' : null });
         if (!diffPaneContainer || !diffPaneContentArea) {
            console.error("diff_pane.js: activateDiffPane - diffPaneContainer or diffPaneContentArea is null! Cannot activate.");
            return;
        }

        // Always re-inject HTML into the content area for consistency
        console.log("diff_pane.js: activateDiffPane - Diff pane content area is being (re)injected.");
        diffPaneContentArea.innerHTML = diffPaneHTMLContent;
        console.log("diff_pane.js: activateDiffPane - HTML (re)injected into diffPaneContentArea.");

        setTimeout(() => {
            console.log("diff_pane.js: activateDiffPane - setTimeout callback executing for setup.");
            setupInternalDiffElements(); // This will query based on the newly injected HTML

            if (!allDiffPaneElementsFound()) {
                console.error("diff_pane.js: activateDiffPane (setTimeout) - Not all internal elements found after setup. Update will likely fail.");
            } else {
                console.log("diff_pane.js: activateDiffPane (setTimeout) - All internal elements found.");
            }
            // Call updateDiffPaneView to set initial state
            window.BoltDevUI.updateDiffPaneView(
                currentOpenFile,
                currentOpenContent,
                currentOpenLangClass,
                currentOpenFile ? "Reviewing File" : "No Changes", // Initial status message
                false // Assuming no diffs initially when activating pane
            );
            console.log("diff_pane.js: activateDiffPane (setTimeout) finished, initial updateDiffPaneView called.");
        }, 0);
        console.log("diff_pane.js: activateDiffPane function finished (setTimeout scheduled).");
    };
    // --- END OF MODIFIED activateDiffPane ---

    window.BoltDevUI.deactivateDiffPane = function() {
        console.log("diff_pane.js: deactivateDiffPane called.");
        // No specific DOM cleanup needed here if activateDiffPane always re-initializes the content area.
    };

    if (diffPaneContainer && diffPaneContainer.classList.contains('active-pane')) {
        console.log("diff_pane.js: Diff pane is active on DOMContentLoaded, calling activateDiffPane with current file data (if available).");
        window.BoltDevUI.activateDiffPane(
            window.BoltDevUI.getCurrentFilePath ? window.BoltDevUI.getCurrentFilePath() : null,
            window.BoltDevUI.getCurrentFileContent ? window.BoltDevUI.getCurrentFileContent() : null,
            window.BoltDevUI.getCurrentFileLangClass ? window.BoltDevUI.getCurrentFileLangClass() : 'plaintext'
        );
    } else {
        console.log("diff_pane.js: Diff pane is NOT active on DOMContentLoaded.");
    }
    console.log("diff_pane.js: Script execution finished.");
});
// --- END OF FILE diff_pane.js ---