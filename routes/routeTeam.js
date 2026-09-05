const express = require('express');
const { GetTeam, GetOwnData } = require('../helpers/osuApiHelper');
const { getFullUsers } = require('../helpers/userHelper');
const { InspectorTeam } = require('../helpers/db');
const { extractYoutubeId, extractColorHex } = require('../helpers/mediaHelper');
const { logActivity } = require('../helpers/logHelper');
const router = express.Router();

router.get('/:teamId{/:ruleset}', async (req, res) => {
    try {
        const { teamId, ruleset } = req.params;
        const teamData = await GetTeam(teamId, ruleset);
        if (teamData) {
            const members = teamData.members;
            //fetch full data (but not osu!api data) for each member
            const fullMembers = await getFullUsers(members.map(m => m.id), true, members);
            teamData.members = fullMembers;

            const extraData = await InspectorTeam.findOne({ where: { id: teamId } });
            const extraDataValues = extraData ? extraData.get({ plain: true }) : {};

            const mergedData = {
                ...teamData,
                ...extraDataValues
            };

            return res.status(200).json(mergedData);
        }
        return res.status(404).json({ error: 'Team not found' });
    } catch (error) {
        console.error('Error during team retrieval:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/:teamId/update', async (req, res) => {
    // For updating team data in the database (the non-osu stuff that we provide)
    const { teamId } = req.params;
    const { user_id, access_token, color, youtube_url } = req.body || {};

    if (!teamId || isNaN(teamId)) {
        return res.status(400).json({ error: 'Team ID must be a number' });
    }

    if (!access_token || typeof access_token !== 'string' || !user_id || isNaN(user_id)) {
        return res.status(401).json({ error: 'Unable to authenticate user' });
    }

    let oauthUser = null;
    try {
        oauthUser = await GetOwnData(access_token);
    } catch (error) {
        console.error('Failed to validate access token for media update:', error);
        return res.status(401).json({ error: 'Invalid access token' });
    }

    if (!oauthUser || !oauthUser.id) {
        return res.status(401).json({ error: 'Invalid user data from access token' });
    }

    if (parseInt(user_id, 10) !== oauthUser.id) {
        return res.status(403).json({ error: 'Access token does not match the provided user ID' });
    }

    try {
        const teamData = await GetTeam(teamId);
        if (!teamData) {
            return res.status(404).json({ error: 'Team not found' });
        }

        if (teamData.leader.id !== oauthUser.id) {
            return res.status(403).json({ error: 'Only the team leader can update team data' });
        }

        const normalizedColorHex = color ? extractColorHex(color) : null;
        const normalizedYoutubeId = youtube_url ? extractYoutubeId(youtube_url) : null;

        //we allow nulls to clear the values, so we don't check for null here
        const updatedData = {
            color: normalizedColorHex,
            youtube_id: normalizedYoutubeId,
        };

        const deltaChanges = {};
        const existingTeam = await InspectorTeam.findOne({ where: { id: teamId } });

        if (existingTeam) {
            const existingData = existingTeam.get({ plain: true });

            for (const key of Object.keys(updatedData)) {
                if (updatedData[key] !== existingData[key]) {
                    deltaChanges[key] = {
                        old: existingData[key],
                        new: updatedData[key]
                    };
                }
            }
        }

        if (existingTeam) {
            await existingTeam.update(updatedData);
        } else {
            await InspectorTeam.create({ id: teamId, ...updatedData });
        }

        try {
            if (deltaChanges && Object.keys(deltaChanges).length > 0) {
                await logActivity({
                    type: 'UPDATE_TEAM_DATA',
                    user_id: oauthUser.id,
                    username: oauthUser.username,
                    team_id: teamId,
                    team_name: teamData.name,
                    team_short: teamData.short_name,
                    data: deltaChanges,
                });
            }
        } catch (err) {
            //not important
            console.error('Failed to log team update activity:', err);
        }

        return res.status(200).json({ message: 'Team data updated successfully' });
    } catch (error) {
        console.error('Error during team update:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
