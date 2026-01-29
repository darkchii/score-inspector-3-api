const express = require('express');
const { Team, TeamMember, TeamStats } = require('../helpers/db');
const router = express.Router();

router.get('/:teamId', async (req, res) => {
    const { teamId } = req.params;
    const { allowDeleted } = req.query; // If true, include deleted teams
    if (!teamId) {
        return res.status(400).json({ error: 'Team ID parameter is required' });
    }

    //validate that teamId is a number
    if (isNaN(teamId)) {
        return res.status(400).json({ error: 'Team ID must be a number' });
    }

    try {
        const team = await Team.findOne({ 
            where: { id: teamId, deleted: allowDeleted === 'true' ? [true, false] : false },
            include: [TeamMember, TeamStats]
        });
        if (team) {
            return res.status(200).json(team);
        } else {
            return res.status(404).json({ error: 'No team found for this Team ID' });
        }
    } catch (error) {
        console.error('Error during team retrieval:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
