const { AltUserLive, AltRegistration, Team, InspectorUserRole, InspectorRole } = require("./db");
const { GetUsers, GetUserData } = require("./osuApiHelper");

async function getFullUsers(userIds, filterRestricted = false) {
    // we want the following structure:
    // {
    //   userId: {
    //     osuAlternative: {...},
    //     osuApi: {...},
    //     team: {...} | null,
    //     is_sync: boolean
    //   },
    //   ...
    // }
    // and return as array

    let users = {};

    const osuAltUsers = await AltUserLive.findAll({
        where: {
            user_id: userIds
        }
    });

    for (const altUser of osuAltUsers) {
        users[altUser.user_id] = {
            osuAlternative: altUser,
            osuApi: null,
            team: null,
            is_sync: false
        };
    }

    // Fetch osu! api data
    // const osuApiUsers = await GetUsers(userIds);
    let osuApiUsers = [];
    if(userIds.length > 1) {
        osuApiUsers = await GetUsers(userIds);
    }else{
        osuApiUsers = [await GetUserData(userIds[0])];
    }

    for (const userId of Object.keys(users)) {
        const osuApiData = osuApiUsers.find(u => u.id === parseInt(userId));
        users[userId].osuApi = osuApiData || null;
    }

    if (filterRestricted) {
        // Filter out where .osuApi is null
        users = Object.fromEntries(
            Object.entries(users).filter(([_, userData]) => userData.osuApi !== null)
        );
    }

    // Fetch teams
    const teamIds = Object.values(users).filter(u => u.osuApi?.team).map(u => u.osuApi.team.id);
    const teams = await Team.findAll({
        where: {
            id: teamIds,
            deleted: false
        }
    });

    for (const userId of Object.keys(users)) {
        const teamData = teams.find(t => t.id === users[userId].osuApi?.team?.id);
        users[userId].team = teamData || null;
    }

    // Fetch roles
    const userRoles = await InspectorUserRole.findAll({
        where: {
            user_id: userIds
        },
        include: [InspectorRole]
    });

    for (const userId of Object.keys(users)) {
        const rolesData = userRoles.filter(r => r.user_id === parseInt(userId)).map(r => r.inspectorRole);
        users[userId].roles = rolesData;
    }

    // Fetch registered/synced status
    const registrations = await AltRegistration.findAll({
        where: {
            user_id: userIds
        }
    });

    for (const userId of Object.keys(users)) {
        const registrationData = registrations.find(r => parseInt(r.user_id) === parseInt(userId));
        users[userId].is_sync = registrationData?.is_synced || false;
    }

    return Object.values(users);
}

module.exports = {
    getFullUsers
};