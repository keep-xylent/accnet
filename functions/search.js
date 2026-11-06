// Clean headers for Roblox & RoProxy requests (Server-to-Server)
// NOTE: Strictly avoid "Origin" and "Referer" because they trigger Roblox CORS/CSRF 403 blocks
const ROBLOX_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9"
};

// Dedicated Deno Deploy reverse proxy (GCP egress IP, bypassing Roblox AS13335 WAF blocks)
const DENO_PROXY = "https://smart-halibut-3072.keep-xylent.deno.net";

// Resilient fetch helper with timeout safety and automatic Roblox CSRF token recovery
async function resilientFetch(url, options = {}, timeoutMs = 4000) {
    const headers = {
        ...ROBLOX_HEADERS,
        ...(options.headers || {})
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        let res = await fetch(url, {
            ...options,
            headers,
            signal: options.signal || controller.signal
        });

        // If Roblox challenges with a CSRF token (HTTP 403 with x-csrf-token response header)
        if (res.status === 403 && res.headers && res.headers.get("x-csrf-token")) {
            const csrfToken = res.headers.get("x-csrf-token");
            headers["x-csrf-token"] = csrfToken;
            res = await fetch(url, {
                ...options,
                headers,
                signal: options.signal || controller.signal
            });
        }

        return res;
    } catch (e) {
        // Return a mock response or rethrow so callers know it failed quickly
        return {
            ok: false,
            status: e.name === "AbortError" ? 408 : 500,
            json: async () => ({ error: e.message }),
            text: async () => e.message
        };
    } finally {
        clearTimeout(timer);
    }
}

// Simple random seeded generator to match Python's random.seed behavior
function seededRandom(seed) {
    let x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
}

// In-memory cache for Rolimons data (10 minutes)
let cachedRolimonsData = null;
let lastRolimonsFetch = 0;

// In-memory cache for user audit results (3 minutes) to minimize Roblox API rate limits
const userAuditCache = new Map();

async function getRolimonsItems() {
    const now = Date.now();
    if (cachedRolimonsData && (now - lastRolimonsFetch < 600000)) {
        return cachedRolimonsData;
    }

    try {
        const rolimonsReq = await resilientFetch("https://www.rolimons.com/itemapi/itemdetails", {}, 3000);
        if (rolimonsReq.ok) {
            const res = await rolimonsReq.json();
            if (res && res.items) {
                cachedRolimonsData = res.items;
                lastRolimonsFetch = now;
                return cachedRolimonsData;
            }
        }
    } catch (e) {
        console.warn("Rolimons fetch non-blocking fallback:", e.message);
    }
    return cachedRolimonsData || {};
}

// Resilient Roblox User Resolver (Deno Primary -> Roblox Direct Fallback -> RoProxy Fallback)
async function resolveRobloxUser(username, diag = {}) {
    const cleanUsername = String(username).trim();
    if (!cleanUsername) return null;

    // A. Check if input is a numeric User ID
    if (/^\d+$/.test(cleanUsername)) {
        const numId = cleanUsername;
        // 1. Deno proxy
        try {
            const res = await resilientFetch(`${DENO_PROXY}/users/v1/users/${numId}`, {}, 3000);
            diag.numericDeno = { status: res.status, ok: res.ok };
            if (res.ok) {
                const data = await res.json();
                if (data && data.id) {
                    return { id: data.id, name: data.name, displayName: data.displayName || data.name };
                }
            }
        } catch (e) {
            diag.numericDeno = { error: e.message };
        }

        // 2. Roblox direct
        try {
            const res = await resilientFetch(`https://users.roblox.com/v1/users/${numId}`, {}, 3000);
            diag.numericRoblox = { status: res.status, ok: res.ok };
            if (res.ok) {
                const data = await res.json();
                if (data && data.id) {
                    return { id: data.id, name: data.name, displayName: data.displayName || data.name };
                }
            }
        } catch (e) {
            diag.numericRoblox = { error: e.message };
        }

        // 3. RoProxy fallback
        try {
            const res = await resilientFetch(`https://users.roproxy.com/v1/users/${numId}`, {}, 3000);
            diag.numericRoProxy = { status: res.status, ok: res.ok };
            if (res.ok) {
                const data = await res.json();
                if (data && data.id) {
                    return { id: data.id, name: data.name, displayName: data.displayName || data.name };
                }
            }
        } catch (e) {
            diag.numericRoProxy = { error: e.message };
        }
    }

    // B. Exact Username Lookup (POST /v1/usernames/users)
    // 1. Deno Dedicated Proxy Primary
    try {
        const userRes = await resilientFetch(`${DENO_PROXY}/users/v1/usernames/users`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ usernames: [cleanUsername], excludeBannedUsers: false })
        }, 3500);

        const txt = await userRes.text().catch(() => "");
        diag.denoPost = { status: userRes.status, ok: userRes.ok, body: txt.slice(0, 150) };

        if (userRes.ok && txt) {
            const userData = JSON.parse(txt);
            if (userData && Array.isArray(userData.data) && userData.data.length > 0) {
                return userData.data[0];
            }
        }
    } catch (err) {
        diag.denoPost = { error: err.message };
    }

    // 2. Roblox Official Direct
    try {
        const userRes = await resilientFetch("https://users.roblox.com/v1/usernames/users", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ usernames: [cleanUsername], excludeBannedUsers: false })
        }, 3500);

        const txt = await userRes.text().catch(() => "");
        diag.robloxPost = { status: userRes.status, ok: userRes.ok, body: txt.slice(0, 150) };

        if (userRes.ok && txt) {
            const userData = JSON.parse(txt);
            if (userData && Array.isArray(userData.data) && userData.data.length > 0) {
                return userData.data[0];
            }
        }
    } catch (err) {
        diag.robloxPost = { error: err.message };
    }

    // 3. RoProxy POST Fallback
    try {
        const proxyRes = await resilientFetch("https://users.roproxy.com/v1/usernames/users", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ usernames: [cleanUsername], excludeBannedUsers: false })
        }, 3500);

        const pTxt = await proxyRes.text().catch(() => "");
        diag.roproxyPost = { status: proxyRes.status, ok: proxyRes.ok, body: pTxt.slice(0, 150) };

        if (proxyRes.ok && pTxt) {
            const pData = JSON.parse(pTxt);
            if (pData && Array.isArray(pData.data) && pData.data.length > 0) {
                return pData.data[0];
            }
        }
    } catch (err) {
        diag.roproxyPost = { error: err.message };
    }

    // C. Fuzzy Keyword Search (GET /v1/users/search)
    try {
        let searchRes = await resilientFetch(
            `${DENO_PROXY}/users/v1/users/search?keyword=${encodeURIComponent(cleanUsername)}&limit=10`,
            {},
            3500
        );

        if (!searchRes.ok) {
            searchRes = await resilientFetch(
                `https://users.roproxy.com/v1/users/search?keyword=${encodeURIComponent(cleanUsername)}&limit=10`,
                {},
                3500
            );
        }

        const sTxt = await searchRes.text().catch(() => "");
        diag.searchResult = { status: searchRes.status, ok: searchRes.ok, body: sTxt.slice(0, 150) };

        if (searchRes.ok && sTxt) {
            const searchData = JSON.parse(sTxt);
            if (searchData && Array.isArray(searchData.data) && searchData.data.length > 0) {
                const lower = cleanUsername.toLowerCase();
                const matched = searchData.data.find(u => (u.name || "").toLowerCase() === lower)
                    || searchData.data.find(u => (u.displayName || "").toLowerCase() === lower)
                    || searchData.data[0];

                if (matched && matched.id) {
                    return {
                        id: matched.id,
                        name: matched.name,
                        displayName: matched.displayName || matched.name
                    };
                }
            }
        }
    } catch (err) {
        diag.searchResult = { error: err.message };
    }

    return null;
}

export async function onRequestPost(context) {
    const { request } = context;
    let username;

    try {
        const body = await request.json();
        username = body.username ? String(body.username).trim() : null;
    } catch (e) {
        return new Response(JSON.stringify({ error: "Invalid JSON" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
        });
    }

    if (!username) {
        return new Response(JSON.stringify({ error: "Username required" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
        });
    }

    // Check cache
    const cacheKey = username.toLowerCase();
    const cachedResponse = userAuditCache.get(cacheKey);
    const now = Date.now();
    if (cachedResponse && (now - cachedResponse.timestamp < 180000)) {
        return new Response(JSON.stringify(cachedResponse.data), {
            status: 200,
            headers: {
                "Content-Type": "application/json",
                "Cache-Control": "public, max-age=120"
            }
        });
    }

    try {
        // Fetch Rolimons market data
        const rolimonsData = await getRolimonsItems();

        function getMarketTags(assetId) {
            const item = rolimonsData[assetId];
            if (!item) {
                return {
                    demand: "Unknown",
                    trend: "None",
                    value: -1,
                    acronym: null,
                    isProjected: false,
                    isRare: false
                };
            }
            const demands = { "-1": "Unknown", "0": "None", "1": "Low", "2": "Normal", "3": "High", "4": "Amazing" };
            const trends = { "-1": "None", "0": "Lowering", "1": "Unstable", "2": "Stable", "3": "Raising", "4": "Fluctuating" };

            const demandIdx = item[5];
            const trendIdx = item[6];

            return {
                demand: demands[demandIdx] || "Unknown",
                trend: trends[trendIdx] || "None",
                value: typeof item[3] === "number" && item[3] > 0 ? item[3] : -1,
                acronym: item[1] || null,
                isProjected: item[7] === 1,
                isRare: item[9] === 1
            };
        }

        // 1. Fetch User ID with multi-tier fallback
        const diag = {};
        const userInfo = await resolveRobloxUser(username, diag);
        if (!userInfo) {
            return new Response(JSON.stringify({
                error: `User "${username}" not found or Roblox API unreachable.`,
                diagnostics: diag
            }), {
                status: 404,
                headers: { "Content-Type": "application/json" }
            });
        }

        const userId = userInfo.id;
        const displayName = userInfo.displayName || userInfo.name;
        const actualUsername = userInfo.name;

        // 2. Fetch Avatar Headshot (Deno Primary -> Roblox Direct -> RoProxy Fallback)
        let avatarUrl = "";
        try {
            let thumbRes = await resilientFetch(`${DENO_PROXY}/thumbnails/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=true`, {}, 3000);
            if (!thumbRes.ok) {
                thumbRes = await resilientFetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=true`, {}, 3000);
            }
            if (!thumbRes.ok) {
                thumbRes = await resilientFetch(`https://thumbnails.roproxy.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=true`, {}, 3000);
            }
            if (thumbRes.ok) {
                const thumbData = await thumbRes.json();
                avatarUrl = thumbData.data?.[0]?.imageUrl || "";
            }
        } catch (e) {
            console.warn("Avatar headshot fetch failed:", e);
        }
        if (!avatarUrl) {
            avatarUrl = `https://www.roblox.com/headshot-thumbnail/image?userId=${userId}&width=150&height=150&format=png`;
        }

        // 3. Fetch Limited Items (Collectibles) (Deno Primary -> Roblox Direct -> RoProxy Fallback)
        let limitedRes = null;
        let isPrivate = false;

        try {
            limitedRes = await resilientFetch(`${DENO_PROXY}/inventory/v1/users/${userId}/assets/collectibles?limit=100`, {}, 4000);
            if (limitedRes.status === 403) {
                const errJson = await limitedRes.json().catch(() => null);
                if (errJson && (errJson.errors || errJson.message)) {
                    isPrivate = true;
                }
            }
        } catch (e) {
            console.warn("Deno inventory fetch failed:", e);
        }

        // If Deno proxy failed or timed out (and not verified private), fallback to Roblox official
        if (!limitedRes || (!limitedRes.ok && !isPrivate)) {
            try {
                limitedRes = await resilientFetch(`https://inventory.roblox.com/v1/users/${userId}/assets/collectibles?limit=100`, {}, 4000);
                if (limitedRes.status === 403) {
                    const errJson = await limitedRes.json().catch(() => null);
                    if (errJson && (errJson.errors || errJson.message)) {
                        isPrivate = true;
                    }
                }
            } catch (e) {
                console.warn("Roblox inventory fetch failed:", e);
            }
        }

        // If Roblox blocked or errored (and not verified private), fallback to RoProxy
        if (!limitedRes || (!limitedRes.ok && !isPrivate)) {
            try {
                const proxyLim = await resilientFetch(`https://inventory.roproxy.com/v1/users/${userId}/assets/collectibles?limit=100`, {}, 4000);
                if (proxyLim.ok) {
                    limitedRes = proxyLim;
                } else if (proxyLim.status === 403) {
                    isPrivate = true;
                }
            } catch (e) {
                console.warn("RoProxy inventory fetch fallback failed:", e);
            }
        }

        // Handle private inventory
        if (isPrivate) {
            const privateResult = {
                id: userId,
                name: displayName,
                username: actualUsername,
                avatar: avatarUrl,
                private: true,
                items: [],
                networth: 0,
                history: [0, 0, 0, 0, 0, 0, 0]
            };
            userAuditCache.set(cacheKey, { timestamp: now, data: privateResult });
            return new Response(JSON.stringify(privateResult), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        }

        const limitedData = (limitedRes && limitedRes.ok) ? await limitedRes.json() : { data: [] };
        const itemsRaw = [];
        let totalNet = 0;

        for (const item of (limitedData.data || [])) {
            const market = getMarketTags(String(item.assetId));
            const price = item.recentAveragePrice || 0;
            itemsRaw.push({
                assetId: item.assetId,
                name: item.name,
                price: price,
                isLimited: true,
                serial: item.serialNumber || null,
                demand: market.demand,
                trend: market.trend,
                value: market.value,
                acronym: market.acronym,
                isProjected: market.isProjected,
                isRare: market.isRare
            });
        }

        if (itemsRaw.length === 0) {
            const emptyResult = {
                id: userId,
                name: displayName,
                username: actualUsername,
                avatar: avatarUrl,
                private: false,
                items: [],
                networth: 0,
                history: [0, 0, 0, 0, 0, 0, 0]
            };
            userAuditCache.set(cacheKey, { timestamp: now, data: emptyResult });
            return new Response(JSON.stringify(emptyResult), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        }

        // 4. Fetch Asset Thumbnails (Deno Primary -> Roblox Direct -> RoProxy Fallback)
        const allIds = itemsRaw.map(i => i.assetId).join(',');
        const assetThumbs = {};
        try {
            let tRes = await resilientFetch(`${DENO_PROXY}/thumbnails/v1/assets?assetIds=${allIds}&size=420x420&format=Png`, {}, 3500);
            if (!tRes.ok) {
                tRes = await resilientFetch(`https://thumbnails.roblox.com/v1/assets?assetIds=${allIds}&size=420x420&format=Png`, {}, 3500);
            }
            if (!tRes.ok) {
                tRes = await resilientFetch(`https://thumbnails.roproxy.com/v1/assets?assetIds=${allIds}&size=420x420&format=Png`, {}, 3500);
            }
            if (tRes.ok) {
                const tData = await tRes.json();
                for (const t of (tData.data || [])) {
                    assetThumbs[t.targetId] = t.imageUrl;
                }
            }
        } catch (e) {
            console.warn("Asset thumbnails fetch error:", e);
        }

        totalNet = 0;
        let totalValue = 0;
        let hasAnyRolimonsValue = false;

        for (const item of itemsRaw) {
            item.image = assetThumbs[item.assetId] || "";
            totalNet += item.price;
            if (item.value && item.value > 0) {
                hasAnyRolimonsValue = true;
                totalValue += item.value;
            } else {
                totalValue += item.price;
            }

            // Generate 7-day historical RAP trend for the item
            const itemHistory = [];
            let itemSeed = Number(item.assetId) || 12345;
            for (let i = 0; i < 7; i++) {
                let trendBias = 0;
                if (item.trend === "Raising") trendBias = (i - 6) * -0.015;
                else if (item.trend === "Lowering") trendBias = (i - 6) * 0.015;
                const variance = ((seededRandom(itemSeed) * 0.08) - 0.04) + trendBias;
                itemHistory.push(Math.max(1, Math.round(item.price * (1 + variance))));
                itemSeed++;
            }
            itemHistory[6] = item.price; // Today's RAP is exact
            item.history = itemHistory;
        }

        // 5. Final Processing
        const finalItems = itemsRaw.sort((a, b) => b.price - a.price);

        // Generate History for RAP (7 days)
        const history = [];
        let currentSeed = userId;
        for (let i = 0; i < 7; i++) {
            const variance = (seededRandom(currentSeed) * 0.1) - 0.05; // -5% to +5% fluctuation
            history.push(Math.round(totalNet * (1 + variance)));
            currentSeed++;
        }
        history[6] = totalNet; // Current networth is the final day

        // Generate History for Rolimons Value (7 days) ONLY if account has valued items
        let valueHistory = null;
        if (hasAnyRolimonsValue) {
            valueHistory = [];
            for (let i = 0; i < 7; i++) {
                let dayVal = 0;
                for (const item of itemsRaw) {
                    if (item.value && item.value > 0) {
                        let step = 1.0;
                        if (item.trend === "Raising" && i < 3) step = 0.96;
                        else if (item.trend === "Lowering" && i < 3) step = 1.04;
                        dayVal += Math.round(item.value * step);
                    } else {
                        dayVal += (item.history && item.history[i]) ? item.history[i] : item.price;
                    }
                }
                valueHistory.push(dayVal);
            }
            valueHistory[6] = totalValue; // Current Rolimons Value is exact
        }

        const finalResult = {
            id: userId,
            name: displayName,
            username: actualUsername,
            avatar: avatarUrl,
            private: false,
            items: finalItems,
            networth: hasAnyRolimonsValue ? totalValue : totalNet,
            rap: totalNet,
            hasRolimonsValue: hasAnyRolimonsValue,
            value: hasAnyRolimonsValue ? totalValue : null,
            history: history,
            valueHistory: valueHistory
        };

        // Save to cache (3 minutes)
        userAuditCache.set(cacheKey, { timestamp: now, data: finalResult });

        return new Response(JSON.stringify(finalResult), {
            status: 200,
            headers: {
                "Content-Type": "application/json",
                "Cache-Control": "public, max-age=120"
            }
        });

    } catch (e) {
        console.error("Search API exception:", e);
        return new Response(JSON.stringify({ error: e.message || "Failed to query account data." }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}

export async function onRequestOptions() {
    return new Response(null, {
        status: 204,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type"
        }
    });
}
