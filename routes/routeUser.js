const express = require('express');
const { Search, GetUserData } = require('../helpers/osuApiHelper');
const { AltUserLive, CheckConnection, Databases, AltScoreLive, Team, AltRegistration } = require('../helpers/db');
const apicache = require('apicache-plus');
const router = express.Router();

router.get('/search', async (req, res) => {
    const { query, page } = req.query;
    if (!query) {
        return res.status(400).json({ error: 'Query parameter is required' });
    }

    try {
        const response = await Search('user', query, page || 1);
        if (response) {
            return res.status(200).json(response);
        } else {
            return res.status(404).json({ error: 'No users found' });
        }
    } catch (error) {
        console.error('Error during user search:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/:userId/profile', apicache('1 hour'), async (req, res) => {
    const { userId } = req.params;
    if (!userId) {
        return res.status(400).json({ error: 'User ID parameter is required' });
    }

    //validate that userId is a number
    if (isNaN(userId)) {
        return res.status(400).json({ error: 'User ID must be a number' });
    }

    try {
        //check connection
        const userLive = await AltUserLive.findOne({ where: { user_id: userId } });
        
        if(!userLive){
            return res.status(404).json({ error: 'User not found in osu!alternative' });
        }
        
        const userRemote = await GetUserData(userId);

        if(!userRemote){
            return res.status(404).json({ error: 'User not found in osu! API' });
        }

        let team = undefined;
        if(userRemote?.team){
            team = await Team.findOne({ where: { id: userRemote.team.id, deleted: false } });
        }

        const userRegistration = await AltRegistration.findOne({ where: { user_id: userId } });

        return res.status(200).json({
            osuAlternative: userLive,
            osuApi: userRemote,
            team: team || null,
            is_sync: userRegistration?.is_synced || false,
        });
        
    }catch(error){
        console.error('Error during user profile retrieval:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
})

router.get('/:userId/scores', apicache('1 hour'), async (req, res) => {
    const { userId } = req.params;
    if (!userId) {
        return res.status(400).json({ error: 'User ID parameter is required' });
    }

    //validate that userId is a number
    if (isNaN(userId)) {
        return res.status(400).json({ error: 'User ID must be a number' });
    }

    try {
        const scores = await AltScoreLive.findAll({ where: { user_id: userId } });
        if (scores && scores.length > 0) {
            return res.status(200).json(scores);
        } else {
            return res.status(404).json({ error: 'No scores found for this user' });
        }
    } catch (error) {
        console.error('Error during user scores retrieval:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
