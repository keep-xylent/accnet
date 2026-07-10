// Simple random seeded generator to match Python's random.seed behavior
function seededRandom(seed) {
    let x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
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
        // Fetch Rolimons data using Cloudflare's cache
        let rolimonsData = {};
        try {
            const rolimonsReq = await fetch("https://www.rolimons.com/itemapi/itemdetails", {
                cf: { cacheTtl: 600 } // Cache for 10 minutes
            });
            if (rolimonsReq.ok) {
                const res = await rolimonsReq.json();
                rolimonsData = res.items || {};
            }
        } catch (e) {
            console.error("Failed to fetch Rolimons:", e);
        }

        function getMarketTags(assetId) {
            const item = rolimonsData[assetId];
            if (!item) return { demand: "Unknown" };
            const demandIdx = item[5];
            const demands = { "-1": "Unknown", "0": "None", "1": "Low", "2": "Normal", "3": "High", "4": "Amazing" };
            return { demand: demands[demandIdx] || "Unknown" };
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
                demand: market.demand
            });
        }

        if (itemsRaw.length === 0) {
            return new Response(JSON.stringify({
                id: userId, name: displayName, username: actualUsername,
                avatar: avatarUrl, private: false, items: [], networth: 0, history: [0,0,0,0,0,0,0]
            }), { status: 200, headers: { "Content-Type": "application/json" } });
        }

        // 4. Fetch Asset Thumbnails
        const allIds = itemsRaw.map(i => i.assetId).join(',');
        const tRes = await fetch(`https://thumbnails.roblox.com/v1/assets?assetIds=${allIds}&size=150x150&format=Png`);
        const tData = await tRes.json();
        const assetThumbs = {};
        for (const t of (tData.data || [])) {
            assetThumbs[t.targetId] = t.imageUrl;
        }

        for (const item of itemsRaw) {
            item.image = assetThumbs[item.assetId] || "";
            totalNet += item.price;
        }

        // 5. Final Processing
        const finalItems = itemsRaw.sort((a, b) => b.price - a.price);

        // Generate History
        const history = [];
        let currentSeed = userId;
        for (let i = 0; i < 7; i++) {
            const variance = (seededRandom(currentSeed) * 0.1) - 0.05; // -5% to +5% fluctuation
            history.push(Math.round(totalNet * (1 + variance)));
            currentSeed++;
        }
        history[6] = totalNet; // Current networth is the final day

        return new Response(JSON.stringify({
            id: userId, name: displayName, username: actualUsername,
            avatar: avatarUrl, private: false, items: finalItems,
            networth: totalNet, history: history
        }), { status: 200, headers: { "Content-Type": "application/json" } });

    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}
