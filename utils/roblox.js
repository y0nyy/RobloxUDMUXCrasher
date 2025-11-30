const axios = require("axios");
const ROBLOX_COOKIE = process.env.ROBLOX_COOKIE;

async function getUserIdFromUsername(username) {
  try {
    const res = await axios.post("https://users.roblox.com/v1/usernames/users", {
      usernames: [username],
      excludeBannedUsers: true,
    });
    return res.data?.data?.[0]?.id || null;
  } catch {
    return null;
  }
}

async function getServerInfo(userId) {
  try {
    const presenceRes = await axios.post(
      "https://presence.roblox.com/v1/presence/users",
      { userIds: [userId] },
      { headers: { Origin: "https://roblox.com", "User-Agent": "Mozilla/5.0", Cookie: `.ROBLOSECURITY=${ROBLOX_COOKIE}` } }
    );

    const userPresence = presenceRes.data.userPresences?.[0];
    if (!userPresence) return { error: "User presence undefined" };
    if (userPresence.userPresenceType !== 2) return { error: "User is not in-game" };
    if (!userPresence.gameId) return { error: "User gameId is null (private or unknown)" };

    const joinRes = await axios.post(
      "https://gamejoin.roblox.com/v1/join-game-instance",
      {
        placeId: userPresence.placeId,
        isTeleport: false,
        gameId: userPresence.gameId,
        gameJoinAttemptId: userPresence.gameId,
      },
      {
        headers: {
          Referer: `https://www.roblox.com/games/${userPresence.placeId}/`,
          Origin: "https://roblox.com",
          "User-Agent": "Roblox/WinInet",
          Cookie: `.ROBLOSECURITY=${ROBLOX_COOKIE}`
        }
      }
    );

    const joinData = joinRes.data.joinScript;
    if (!joinData) return { error: "Join script missing" };

    let endpoints = [];
    if (joinData.UdmuxEndpoints?.length) {
      endpoints = joinData.UdmuxEndpoints.map(u => `${u.Address}:${u.Port}`);
    } else if (joinData.ServerConnections?.length) {
      endpoints = joinData.ServerConnections.map(c => `${c.Address}:${c.Port}`);
    }

    return {
      placeId: userPresence.placeId || "Unknown",
      jobId: joinRes.data.jobId || "Unknown",
      Test: joinData,
      udmux: endpoints,
    };

  } catch (err) {
    console.error("Error fetching server info:", err.message);
    return { error: "Failed to fetch server info" };
  }
}

module.exports = { getUserIdFromUsername, getServerInfo };
