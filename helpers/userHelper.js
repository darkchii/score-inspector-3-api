const { AltUserLive, AltRegistration, Team, InspectorUserRole, InspectorRole, InspectorPlayerReputation } = require("./db");
const { GetUsers, GetUserData } = require("./osuApiHelper");

const FULL_USERS_CACHE_TTL_MS = 10 * 60 * 1000;
const fullUsersCache = new Map();

function getCachedFullUser(userId) {
    const cacheKey = String(userId);
    const cached = fullUsersCache.get(cacheKey);

    if (!cached) {
        return null;
    }

    if (cached.expiresAt <= Date.now()) {
        fullUsersCache.delete(cacheKey);
        return null;
    }

    return cached.data;
}

function setCachedFullUser(userId, userData) {
    fullUsersCache.set(String(userId), {
        expiresAt: Date.now() + FULL_USERS_CACHE_TTL_MS,
        data: userData
    });
}

async function getFullUsers(userIds, filterRestricted = false) {
    if (!Array.isArray(userIds) || userIds.length === 0) {
        return [];
    }

    const requestedUserIds = [...new Set(userIds.map(id => parseInt(id, 10)).filter(Number.isFinite))];
    const users = {};
    const missingUserIds = [];

    console.log(`Fetching full user data for user IDs: ${requestedUserIds.join(", ")}`);
    for (const userId of requestedUserIds) {
        const cachedUser = getCachedFullUser(userId);
        if (cachedUser) {
            users[userId] = cachedUser;
            console.log(`Cache hit for user ID ${userId}`);
        } else {
            missingUserIds.push(userId);
            console.log(`Cache miss for user ID ${userId}`);
        }
    }

    if (missingUserIds.length > 0) {
        try {
            const fetchedUsers = {};

            // Fetch osu! api data
            let osuApiUsers = [];
            if (missingUserIds.length > 1) {
                osuApiUsers = await GetUsers(missingUserIds);
            } else {
                osuApiUsers = [await GetUserData(missingUserIds[0])];
            }

            for (const osuApiUser of osuApiUsers) {
                if (!osuApiUser || !osuApiUser.id) {
                    continue;
                }

                fetchedUsers[osuApiUser.id] = {
                    osuAlternative: null,
                    osuApi: osuApiUser,
                    team: null,
                    is_sync: false
                };
            }

            const osuAltUsers = await AltUserLive.findAll({
                where: {
                    user_id: missingUserIds
                }
            });

            for (const osuAltUser of osuAltUsers) {
                if (fetchedUsers[osuAltUser.user_id]) {
                    fetchedUsers[osuAltUser.user_id].osuAlternative = osuAltUser;
                }
            }

            // Fetch teams
            const teamIds = Object.values(fetchedUsers)
                .filter(u => u.osuApi?.team)
                .map(u => u.osuApi.team.id);
            const teams = teamIds.length > 0
                ? await Team.findAll({
                    where: {
                        id: teamIds,
                        deleted: false
                    }
                })
                : [];

            const teamMap = {};
            teams.forEach(t => {
                teamMap[t.id] = t;
            });

            for (const userId of Object.keys(fetchedUsers)) {
                const teamData = teamMap[fetchedUsers[userId].osuApi?.team?.id];
                fetchedUsers[userId].team = teamData || null;
            }

            // Fetch roles
            const userRoles = await InspectorUserRole.findAll({
                where: {
                    user_id: missingUserIds
                },
                include: [InspectorRole]
            });

            const userRolesMap = {};
            userRoles.forEach(r => {
                if (!userRolesMap[r.user_id]) {
                    userRolesMap[r.user_id] = [];
                }
                userRolesMap[r.user_id].push(r.inspectorRole);
            });

            for (const userId of Object.keys(fetchedUsers)) {
                const rolesData = userRolesMap[parseInt(userId, 10)] || [];
                fetchedUsers[userId].roles = rolesData;
            }

            // Fetch reputation count
            const reputations = await InspectorPlayerReputation.findAll({
                where: {
                    target_type: 'user',
                    target_id: missingUserIds
                }
            });

            const reputationMap = {};
            reputations.forEach(r => {
                if (!reputationMap[r.target_id]) {
                    reputationMap[r.target_id] = 0;
                }
                reputationMap[r.target_id]++;
            });

            for (const userId of Object.keys(fetchedUsers)) {
                fetchedUsers[userId].reputation_count = reputationMap[parseInt(userId, 10)] || 0;
            }

            // Fetch registered/synced status
            const registrations = await AltRegistration.findAll({
                where: {
                    user_id: missingUserIds
                }
            });

            const registrationMap = {};
            registrations.forEach(r => {
                registrationMap[r.user_id] = r;
            });

            for (const userId of Object.keys(fetchedUsers)) {
                const registrationData = registrationMap[parseInt(userId, 10)];
                fetchedUsers[userId].is_sync = registrationData?.is_synced || false;
            }

            for (const userId of Object.keys(fetchedUsers)) {
                users[userId] = fetchedUsers[userId];
                setCachedFullUser(userId, fetchedUsers[userId]);
            }
        } catch (error) {
            console.error("Error fetching full user data:", error);
        }
    }

    let fullUsers = requestedUserIds
        .map(userId => users[userId])
        .filter(Boolean);

    if (filterRestricted) {
        fullUsers = fullUsers.filter(userData => userData.osuApi !== null);
    }

    return fullUsers;
}

module.exports = {
    getFullUsers
};