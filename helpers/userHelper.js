const { AltUserLive, AltRegistration, InspectorUserRole, InspectorRole, InspectorPlayerReputation, InspectorTeam } = require("./db");
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

async function getFullUsers(userIds, filterRestricted = false, existingApiUsers = []) {
    if (!Array.isArray(userIds) || userIds.length === 0) {
        return [];
    }

    const requestedUserIds = [...new Set(userIds.map(id => parseInt(id, 10)).filter(Number.isFinite))];
    const users = {};
    const missingUserIds = [];

    for (const userId of requestedUserIds) {
        const cachedUser = getCachedFullUser(userId);
        if (cachedUser) {
            users[userId] = cachedUser;
        } else {
            missingUserIds.push(userId);
        }
    }

    if (missingUserIds.length > 0) {
        try {
            const fetchedUsers = {};

            // Fetch osu! api data
            let osuApiUsers = [];
            let osuApiIdCacheHits = []; //store IDs that were in the existingApiUsers cache
            
            for(const userId of missingUserIds) {
                const existingApiUser = existingApiUsers.find(u => u.id === userId);
                if (existingApiUser) {
                    osuApiUsers.push(existingApiUser);
                    osuApiIdCacheHits.push(userId);
                }
            }

            let remainingUserIds = missingUserIds.filter(id => !osuApiIdCacheHits.includes(id));
            if (remainingUserIds.length > 1) {
                osuApiUsers = await GetUsers(remainingUserIds);
            } else if (remainingUserIds.length === 1) {
                osuApiUsers = [await GetUserData(remainingUserIds[0])];
            }

            for (const osuApiUser of osuApiUsers) {
                if (!osuApiUser || !osuApiUser.id) {
                    continue;
                }

                fetchedUsers[osuApiUser.id] = {
                    osuAlternative: null,
                    osuApi: osuApiUser,
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

            // Fetch extra team data (osuUser.team?.id)
            const teamIds = osuApiUsers
                .filter(u => u.team && u.team.id)
                .map(u => u.team.id);

            const teamsData = await InspectorTeam.findAll({
                where: {
                    id: teamIds
                }
            });

            // Merge team data into the user[].osuApi.team (not set it, merge it in, its extra data for the team)
            const teamsDataMap = {};
            teamsData.forEach(team => {
                teamsDataMap[team.id] = team;
            });

            for (const osuApiUser of osuApiUsers) {
                if (osuApiUser.team && osuApiUser.team.id && teamsDataMap[osuApiUser.team.id]) {
                    osuApiUser.team = {
                        ...osuApiUser.team,
                        ...teamsDataMap[osuApiUser.team.id].get({ plain: true })
                    }
                }
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