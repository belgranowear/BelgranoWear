const DEFAULT_TIMEOUT_MS = 8000;

export const fetchWithTimeout = async (url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) => {
    const controller    = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, { ...options, signal: controller.signal });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status} for ${url}`);
        }

        return response;
    } finally {
        clearTimeout(timeoutHandle);
    }
};

export default { fetchWithTimeout };
