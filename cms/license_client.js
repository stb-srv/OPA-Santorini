import { CONFIG } from './config.js';

/**
 * Grieche-CMS License Client
 * Handles communication with the central License Server.
 */
export class LicenseClient {
    constructor() {
        this.status = 'unknown';
        this.lastChecked = null;
    }

    /**
     * Start the license verification process.
     */
    async verifyLicense() {
        console.log(`[License] Checking license key: ${CONFIG.license.key} for domain: ${CONFIG.domain}`);
        
        try {
            // Simulate API request to Libenzserver.md concept
            const response = await this._mockApiCall('/api/v1/validate', {
                license_key: CONFIG.license.key,
                domain: CONFIG.domain
            });

            this.status = response.status;
            this.lastChecked = new Date();
            
            console.log(`[License] Verification successful. Status: ${this.status}`);
            return response;
        } catch (error) {
            console.error(`[License] Verification failed:`, error);
            // Fallback to cached (local) config if server is unreachable
            return { status: CONFIG.license.status, cached: true };
        }
    }

    /**
     * Mock an API call for demonstration.
     */
    _mockApiCall(endpoint, data) {
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve({
                    status: 'active',
                    expires_at: CONFIG.license.expiresAt,
                    allowed_modules: CONFIG.modules,
                    signature: 'sha256-mock-signature-at-pos-123'
                });
            }, 800);
        });
    }

    /**
     * Check if a module is allowed by the license.
     */
    isAuthorized(moduleName) {
        if (this.status !== 'active') return false;
        return !!CONFIG.modules[moduleName];
    }
}

export const licenseClient = new LicenseClient();
