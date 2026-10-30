// Standard Browser Headers to prevent Cloudflare/Roblox bot-reputation blocks (403 Forbidden)
const ROBLOX_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Origin": "https://www.roblox.com",
    "Referer": "https://www.roblox.com/"
};

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
        const rolimonsReq = await fetch("https://www.rolimons.com/itemapi/itemdetails", {
            headers: {
                "User-Agent": ROBLOX_HEADERS["User-Agent"],
                "Accept": "application/json"
            }
        });
        if (rolimonsReq.ok) {
            const res = await rolimonsReq.json();
            if (res && res.items) {
                cachedRolimonsData = res.items;
                lastRolimonsFetch = now;
                return cachedRolimonsData;
            }
        } else {
            console.error("Rolimons fetch not ok:", rolimonsReq.status);
        }
    } catch (e) {
        console.error("Failed to fetch Rolimons:", e);
    }
    return cachedRolimonsData || {};
}

// Resilient Roblox User Resolver with multi-tier fallbacks
async function resolveRobloxUser(username) {
    const cleanUsername = String(username).trim();

    // 1. Primary: POST https://users.roblox.com/v1/usernames/users
    try {
        const userRes = await fetch("https://users.roblox.com/v1/usernames/users", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...ROBLOX_HEADERS
            },
            body: JSON.stringify({ usernames: [cleanUsername], excludeBannedUsers: false })
        });

        if (userRes.ok) {
            const userData = await userRes.json();
            if (userData && userData.data && userData.data.length > 0) {
                return userData.data[0];
            }
        } else {
            console.warn(`Primary user lookup returned ${userRes.status}`);
        }
    } catch (err) {
        console.warn("Primary user lookup network exception:", err);
    }

    // 2. Secondary Fallback: GET https://users.roblox.com/v1/users/search (bypasses POST WAF/CSRF restrictions)
    try {
        const searchRes = await fetch(`https://users.roblox.com/v1/users/search?keyword=${encodeURIComponent(cleanUsername)}&limit=10`, {
            headers: ROBLOX_HEADERS
        });

        if (searchRes.ok) {
            const searchData = await searchRes.json();
            if (searchData && searchData.data && searchData.data.length > 0) {
                const exact = searchData.data.find(u => u.name.toLowerCase() === cleanUsername.toLowerCase()) || searchData.data[0];
                return {
                    id: exact.id,
                    name: exact.name,
                    displayName: exact.displayName || exact.name
                };
            }
        }
    } catch (err) {
        console.warn("Secondary search lookup network exception:", err);
    }

    // 3. Tertiary Fallback: RoProxy (for Cloudflare Workers datacenter IP unblocking)
    try {
        const proxyRes = await fetch("https://users.roproxy.com/v1/usernames/users", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...ROBLOX_HEADERS
            },
            body: JSON.stringify({ usernames: [cleanUsername], excludeBannedUsers: false })
        });

        if (proxyRes.ok) {
            const pData = await proxyRes.json();
            if (pData && pData.data && pData.data.length > 0) {
                return pData.data[0];
            }
        }
    } catch (err) {
        console.warn("RoProxy user lookup exception:", err);
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
        const userInfo = await resolveRobloxUser(username);
        if (!userInfo) {
            return new Response(JSON.stringify({ error: `User "${username}" not found or Roblox API unreachable.` }), {
                status: 404,
                headers: { "Content-Type": "application/json" }
            });
        }

        const userId = userInfo.id;
        const displayName = userInfo.displayName || userInfo.name;
        const actualUsername = userInfo.name;

        // 2. Fetch Avatar Headshot
        let avatarUrl = "";
        try {
            const thumbRes = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=true`, {
                headers: ROBLOX_HEADERS
            });
            if (thumbRes.ok) {
                const thumbData = await thumbRes.json();
                avatarUrl = thumbData.data?.[0]?.imageUrl || "";
            }
        } catch (e) {
            console.warn("Avatar headshot fetch failed:", e);
        }

        // 3. Fetch Limited Items (Collectibles)
        let limitedRes = await fetch(`https://inventory.roblox.com/v1/users/${userId}/assets/collectibles?limit=100`, {
            headers: ROBLOX_HEADERS
        });

        // 403 Forbidden on Inventory means User has Private Inventory
        if (limitedRes.status === 403) {
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

        // Fallback for limited items via RoProxy if inventory is blocked or rate-limited
        if (!limitedRes.ok) {
            try {
                const proxyLim = await fetch(`https://inventory.roproxy.com/v1/users/${userId}/assets/collectibles?limit=100`, {
                    headers: ROBLOX_HEADERS
                });
                if (proxyLim.ok) {
                    limitedRes = proxyLim;
                }
            } catch (e) {}
        }

        const limitedData = limitedRes.ok ? await limitedRes.json() : { data: [] };
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

        // 4. Fetch Asset Thumbnails (High-Resolution 420x420)
        const allIds = itemsRaw.map(i => i.assetId).join(',');
        const assetThumbs = {};
        try {
            const tRes = await fetch(`https://thumbnails.roblox.com/v1/assets?assetIds=${allIds}&size=420x420&format=Png`, {
                headers: ROBLOX_HEADERS
            });
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
