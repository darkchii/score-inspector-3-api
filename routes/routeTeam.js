const express = require('express');
const { GetTeam } = require('../helpers/osuApiHelper');
const { getFullUsers } = require('../helpers/userHelper');
const { InspectorTeam } = require('../helpers/db');
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
    }catch (error) {
        console.error('Error during team retrieval:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
