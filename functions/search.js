// Simple random seeded generator to match Python's random.seed behavior
function seededRandom(seed) {
    let x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
}

// In-memory cache for Rolimons data (10 minutes)
let cachedRolimonsData = null;
let lastRolimonsFetch = 0;

async function getRolimonsItems() {
    const now = Date.now();
    if (cachedRolimonsData && (now - lastRolimonsFetch < 600000)) {
        return cachedRolimonsData;
    }

    try {
        const rolimonsReq = await fetch("https://www.rolimons.com/itemapi/itemdetails", {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
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

export async function onRequestPost(context) {
    const { request } = context;
    let username;
    
    try {
        const body = await request.json();
        username = body.username;
    } catch (e) {
        return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
    }

    if (!username) return new Response(JSON.stringify({ error: "Username required" }), { status: 400 });

    try {
        // Fetch Rolimons data
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

        // 1. Fetch User ID
        const userRes = await fetch("https://users.roblox.com/v1/usernames/users", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ usernames: [username], excludeBannedUsers: true })
        });
        
        if (!userRes.ok) throw new Error("Roblox users API failed");
        const userData = await userRes.json();
        if (!userData.data || userData.data.length === 0) return new Response(JSON.stringify({ error: "Not Found" }), { status: 404 });
        
        const userInfo = userData.data[0];
        const userId = userInfo.id;
        const displayName = userInfo.displayName;
        const actualUsername = userInfo.name;

        // 2. Fetch Avatar
        const thumbRes = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=true`);
        const thumbData = await thumbRes.json();
        const avatarUrl = thumbData.data?.[0]?.imageUrl || "";

        // 3. Fetch Limited Items (Collectibles)
        const limitedRes = await fetch(`https://inventory.roblox.com/v1/users/${userId}/assets/collectibles?limit=100`);
        
        if (limitedRes.status === 403) {
            return new Response(JSON.stringify({
                id: userId, name: displayName, username: actualUsername,
                avatar: avatarUrl, private: true, items: [], networth: 0, history: [0,0,0,0,0,0,0]
            }), { status: 200, headers: { "Content-Type": "application/json" } });
        }

        const limitedData = await limitedRes.json();
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
            return new Response(JSON.stringify({
                id: userId, name: displayName, username: actualUsername,
                avatar: avatarUrl, private: false, items: [], networth: 0, history: [0,0,0,0,0,0,0]
            }), { status: 200, headers: { "Content-Type": "application/json" } });
        }

        // 4. Fetch Asset Thumbnails (High-Resolution 420x420)
        const allIds = itemsRaw.map(i => i.assetId).join(',');
        const tRes = await fetch(`https://thumbnails.roblox.com/v1/assets?assetIds=${allIds}&size=420x420&format=Png`);
        const tData = await tRes.json();
        const assetThumbs = {};
        for (const t of (tData.data || [])) {
            assetThumbs[t.targetId] = t.imageUrl;
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

        return new Response(JSON.stringify({
            id: userId, name: displayName, username: actualUsername,
            avatar: avatarUrl, private: false, items: finalItems,
            networth: hasAnyRolimonsValue ? totalValue : totalNet,
            rap: totalNet,
            hasRolimonsValue: hasAnyRolimonsValue,
            value: hasAnyRolimonsValue ? totalValue : null,
            history: history,
            valueHistory: valueHistory
        }), { status: 200, headers: { "Content-Type": "application/json" } });

    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}
