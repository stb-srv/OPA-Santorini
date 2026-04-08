/**
 * OPA! Extra Plugin - Website Side
 */
(function() {
    console.log("🌊 Guest Plugin 'Opa! Extra' geladen!");

    // Inject a special badge or info in the footer
    Website.onInit((data) => {
        console.log("Website init with data:", data);
        Website.injectHTML('footer .container', `
            <div style="margin-top:20px; padding:10px; border-top:1px solid rgba(255,255,255,0.1); font-size:0.8rem; opacity:0.5; text-align:center;">
                <i class="fas fa-magic"></i> Powered by Opa! Extra Plugin
            </div>
        `);
    });

    // Listen to tab switches
    Website.onTabSwitch((tabId) => {
        console.log("Guest switched to tab:", tabId);
    });
})();
